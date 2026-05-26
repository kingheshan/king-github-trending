import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

loadLocalEnv();

const DATA_FILE = path.resolve('public/data/trending.json');
const CACHE_FILE = path.resolve('data/feishu-digest-cache.json');
const PREVIEW_FILE = path.resolve('logs/feishu-digest-preview.md');
const SITE_URL = process.env.SITE_URL || 'https://kingheshan.github.io/king-github-trending/';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || '';
const FEISHU_WEBHOOK_SECRET = process.env.FEISHU_WEBHOOK_SECRET || '';
const FEISHU_DIGEST_FORCE = process.env.FEISHU_DIGEST_FORCE === '1';
const FEISHU_DIGEST_DRY_RUN = process.env.FEISHU_DIGEST_DRY_RUN === '1';

function loadLocalEnv() {
  const file = path.resolve('.env.local');
  try {
    const text = readFileSync(file, 'utf8');
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const [key, ...rest] = trimmed.split('=');
      if (process.env[key]) return;
      process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '');
    });
  } catch {
    // Local-only config is optional.
  }
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value || '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/#.*$/, '');
}

function flattenRadarItems(radar) {
  const map = new Map();
  const add = (item) => {
    const key = normalizeUrl(item.url) || item.id || item.title;
    if (!key || map.has(key)) return;
    map.set(key, item);
  };

  (radar.picks || []).forEach(add);
  (radar.categories || []).forEach((category) => {
    (category.items || []).forEach((item) => add({ ...item, labelName: item.labelName || category.label }));
  });

  return [...map.values()];
}

function valueScore(item) {
  const score = Number(item.score || 0);
  const signalBoost = Math.min(10, (item.signals || []).length * 2);
  const reasonBoost = item.reason ? 6 : 0;
  const recency = item.publishedAt ? Math.max(0, 8 - ((Date.now() - new Date(item.publishedAt).getTime()) / 36e5)) : 0;
  return score * 1.4 + signalBoost + reasonBoost + recency;
}

function selectTopItems(data) {
  const raw = flattenRadarItems(data.radar || {})
    .filter((item) => item?.title && item?.url)
    .map((item) => ({
      title: compactText(item.title),
      url: item.url,
      siteName: compactText(item.siteName || item.source || '来源'),
      source: compactText(item.source || ''),
      category: compactText(item.labelName || item.label || 'AI 综合'),
      publishedAt: item.publishedAt || '',
      score: Number(item.score || 0),
      reason: compactText(item.reason || ''),
      signals: Array.isArray(item.signals) ? item.signals.map(compactText).filter(Boolean).slice(0, 4) : [],
      valueScore: valueScore(item)
    }))
    .sort((a, b) => b.valueScore - a.valueScore || b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));

  const selected = [];
  const sourceCount = new Map();
  for (const item of raw) {
    const sourceKey = item.siteName || item.source || 'unknown';
    if ((sourceCount.get(sourceKey) || 0) >= 3 && selected.length < 7) continue;
    selected.push(item);
    sourceCount.set(sourceKey, (sourceCount.get(sourceKey) || 0) + 1);
    if (selected.length === 10) break;
  }

  return selected;
}

function topRepos(data) {
  return Object.values(data.periods || {})
    .flatMap((period) => period.repos || [])
    .filter((repo) => repo?.owner && repo?.repo)
    .sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0))
    .slice(0, 5)
    .map((repo) => ({
      name: `${repo.owner}/${repo.repo}`,
      url: repo.url,
      lang: repo.lang || '',
      stars: repo.stars || 0,
      summary: compactText(repo.summaryZh || repo.desc || '')
    }));
}

function fallbackDigest(data, items) {
  return {
    title: `RepoPulse 每日 AI 热点 Top 10 · ${formatDate(data.meta?.generatedAt)}`,
    executiveSummary: `过去 24 小时共捕捉 ${data.radar?.total || items.length} 条 AI/科技信号。今日重点集中在模型发布、Agent 工作流、开发工具和产业应用，建议优先关注能够改变开发效率、内容生产或产品形态的更新。`,
    takeaways: [
      '先看高评分且多来源重复出现的主题，通常代表短期关注度正在集中。',
      '对工具类项目建议当天试跑，判断是否能进入个人或团队工作流。',
      '对模型和平台更新建议关注成本、可用区域、API 兼容性和迁移门槛。'
    ],
    items: items.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      source: item.siteName,
      category: item.category,
      why: item.reason || `${item.category} 方向的高热更新，评分 ${item.score}。`,
      action: item.signals.length ? `跟进关键词：${item.signals.join(' / ')}` : '阅读全文，判断是否需要纳入技术雷达或选题池。',
      url: item.url
    }))
  };
}

function parseJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found');
  return JSON.parse(text.slice(start, end + 1));
}

async function callDeepSeekDigest(data, items) {
  if (!DEEPSEEK_API_KEY) return fallbackDigest(data, items);

  const prompt = [
    '你是一个中文 AI/科技资讯雷达编辑。请基于 RepoPulse 网站最新数据，提炼今日最值得发到飞书的 TOP 10 热门内容。',
    '输出严格 JSON，不要 Markdown，不要代码块。字段：title、executiveSummary（120-180字）、takeaways（三条）、items。',
    'items 每项字段：rank、title、source、category、why（40-70字，说明为什么值得看）、action（20-40字，给读者下一步建议）、url。',
    '排序标准：热度评分、AI 相关性、对产品/研发/商业判断的价值、来源多样性。',
    `站点地址：${SITE_URL}`,
    `数据更新时间：${data.meta?.generatedAt || ''}`,
    `AI 雷达总信号：${data.radar?.total || 0}`,
    `GitHub 热门项目参考：${JSON.stringify(topRepos(data))}`,
    `候选内容：${JSON.stringify(items)}`
  ].join('\n');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: 'You produce concise Chinese editorial intelligence as strict JSON.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) throw new Error(`DeepSeek digest failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const digest = parseJsonObject(json.choices?.[0]?.message?.content || '');
  return {
    ...fallbackDigest(data, items),
    ...digest,
    items: Array.isArray(digest.items) && digest.items.length ? digest.items.slice(0, 10) : fallbackDigest(data, items).items
  };
}

async function readCache() {
  try {
    return { version: 1, digests: {}, ...(JSON.parse(await readFile(CACHE_FILE, 'utf8'))) };
  } catch {
    return { version: 1, digests: {} };
  }
}

async function writeCache(cache) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function toFeishuPost(digest, data) {
  const content = [];
  content.push([{ tag: 'text', text: `${digest.executiveSummary}\n` }]);
  content.push([{ tag: 'text', text: `站点：` }, { tag: 'a', text: 'RepoPulse', href: SITE_URL }]);
  content.push([{ tag: 'text', text: `数据：AI 雷达 ${data.radar?.total || 0} 条 · 来源分组 ${data.radar?.sourceCount || 0} · ${formatDate(data.meta?.generatedAt)}\n` }]);

  (digest.takeaways || []).slice(0, 3).forEach((item, index) => {
    content.push([{ tag: 'text', text: `洞察 ${index + 1}：${compactText(item)}` }]);
  });

  (digest.items || []).slice(0, 10).forEach((item, index) => {
    const rank = item.rank || index + 1;
    content.push([
      { tag: 'text', text: `\n#${rank} ${compactText(item.title)}\n${compactText(item.source)} · ${compactText(item.category)}\n价值：${compactText(item.why)}\n建议：${compactText(item.action)}\n` },
      { tag: 'a', text: '查看原文', href: item.url }
    ]);
  });

  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: digest.title || 'RepoPulse 每日 AI 热点 Top 10',
          content
        }
      }
    }
  };
}

function feishuSign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).update('').digest('base64');
}

async function sendFeishu(payload) {
  if (!FEISHU_WEBHOOK_URL || FEISHU_DIGEST_DRY_RUN) return { skipped: true };

  const body = { ...payload };
  if (FEISHU_WEBHOOK_SECRET) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = feishuSign(FEISHU_WEBHOOK_SECRET, timestamp);
  }

  const res = await fetch(FEISHU_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // Keep raw text for error reporting.
  }
  const okCode = json.code === 0 || json.StatusCode === 0 || json.status_code === 0;
  if (!res.ok || (Object.keys(json).length && !okCode)) {
    throw new Error(`Feishu webhook failed: ${res.status} ${text}`);
  }
  return json;
}

function digestMarkdown(digest) {
  const lines = [`# ${digest.title}`, '', digest.executiveSummary, ''];
  (digest.takeaways || []).forEach((item, index) => lines.push(`- 洞察 ${index + 1}: ${compactText(item)}`));
  lines.push('');
  (digest.items || []).slice(0, 10).forEach((item, index) => {
    lines.push(`${index + 1}. ${compactText(item.title)}`);
    lines.push(`   - 来源: ${compactText(item.source)} / ${compactText(item.category)}`);
    lines.push(`   - 价值: ${compactText(item.why)}`);
    lines.push(`   - 建议: ${compactText(item.action)}`);
    lines.push(`   - 链接: ${item.url}`);
  });
  lines.push('');
  lines.push(`RepoPulse: ${SITE_URL}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const topItems = selectTopItems(data);
  if (!topItems.length) throw new Error('No radar items available for Feishu digest.');

  const digestHash = hash({
    generatedAt: data.meta?.generatedAt,
    items: topItems.map((item) => ({ title: item.title, url: item.url, score: item.score }))
  });
  const cache = await readCache();
  let entry = cache.digests[digestHash];

  if (!entry?.digest) {
    let digest;
    try {
      digest = await callDeepSeekDigest(data, topItems);
    } catch (error) {
      console.warn(`[DeepSeek digest] ${error.message}`);
      digest = fallbackDigest(data, topItems);
    }
    entry = {
      hash: digestHash,
      generatedAt: new Date().toISOString(),
      model: DEEPSEEK_API_KEY ? DEEPSEEK_MODEL : 'fallback',
      digest
    };
    cache.digests[digestHash] = entry;
    await writeCache(cache);
  }

  await mkdir(path.dirname(PREVIEW_FILE), { recursive: true });
  await writeFile(PREVIEW_FILE, digestMarkdown(entry.digest), 'utf8');

  if (entry.sentAt && !FEISHU_DIGEST_FORCE) {
    console.log(`Digest already sent at ${entry.sentAt}. Preview: ${PREVIEW_FILE}`);
    return;
  }

  const result = await sendFeishu(toFeishuPost(entry.digest, data));
  if (result.skipped) {
    console.log(`Feishu webhook is not configured or dry-run is enabled. Preview: ${PREVIEW_FILE}`);
    return;
  }

  entry.sentAt = new Date().toISOString();
  entry.response = result;
  await writeCache(cache);
  console.log(`Feishu digest sent. Preview: ${PREVIEW_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
