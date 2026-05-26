import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

loadLocalEnv();

const OUTFILE = path.resolve('public/data/trending.json');
const CACHE_FILE = path.resolve('data/deepseek-cache.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEEPSEEK_MAX_SUMMARIES = Number(process.env.DEEPSEEK_MAX_SUMMARIES || 80);
const YEAR = new Date().getFullYear();

const PERIODS = [
  { key: 'daily', label: '今日', since: 'daily' },
  { key: 'weekly', label: '本周', since: 'weekly' },
  { key: 'monthly', label: '本月', since: 'monthly' }
];

const LANG_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  Vue: '#41b883',
  'Jupyter Notebook': '#DA5B0B',
  Dart: '#00B4AB',
  Svelte: '#ff3e00',
  Astro: '#ff5a03'
};

const RADAR_LABELS = {
  model_release: '模型发布',
  agent_workflow: 'Agent 工作流',
  ai_product_update: '产品更新',
  developer_tool: '开发工具',
  developer_tooling: '开发工具',
  infrastructure: '基础设施',
  infra_compute: '算力基础设施',
  ai_general: 'AI 综合',
  curated_hotlist: '精选榜单',
  industry_business: '产业商业',
  robotics: '机器人',
  research: '研究论文',
  funding: '融资商业'
};

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
    // Optional local-only config.
  }
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  return raw ? Number(raw) : 0;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function langColor(lang, fallback = '') {
  return fallback || LANG_COLORS[lang] || '#8b949e';
}

function buildTemplateInsights(repo) {
  const langBit = repo.lang ? `，主要语言是 ${repo.lang}` : '';
  const desc = repo.desc ? `它的公开描述是：“${repo.desc}”` : '它近期在 GitHub 上获得较高关注';
  return {
    summaryZh: `${repo.owner}/${repo.repo} 是一个近期热度较高的开源项目${langBit}。${desc}。建议先把它当作候选工具进行快速试跑，再根据 README、issue 活跃度和依赖复杂度决定是否纳入长期技术栈。`,
    scenarios: [
      '快速判断项目是否值得收藏、试用或引入团队技术雷达。',
      '让 AI agent 克隆仓库、阅读 README，并跑通最小可用示例。',
      '围绕同类项目做竞品调研、功能拆解或技术选型。'
    ],
    agentInstallPrompt: `把 ${repo.url} 克隆到 ~/Code/${repo.repo}。请先读取 README.md、package.json、pyproject.toml、Cargo.toml 或 go.mod 等项目入口文件，判断技术栈和安装命令。安装依赖后，跑通一个 README 中最小的示例或测试命令；如果需要 API key 或额外服务，请列出变量名、配置文件路径和最小启动步骤。`
  };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json',
      'User-Agent': 'RepoPulseBot/1.0 (+https://github.com/kingheshan/king-github-trending)'
    }
  });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function parseTrending(html) {
  const $ = cheerio.load(html);
  const repos = [];

  $('article.Box-row').each((index, element) => {
    const row = $(element);
    const href = row.find('h2 a[href^="/"]').attr('href');
    if (!href) return;

    const [owner, repo] = href.replace(/^\/+/, '').split('/');
    if (!owner || !repo) return;

    const desc = compactText(row.find('p').first().text());
    const lang = compactText(row.find('[itemprop="programmingLanguage"]').first().text());
    const colorStyle = row.find('.repo-language-color').attr('style') || '';
    const color = colorStyle.match(/#[0-9a-fA-F]{3,8}/)?.[0] || '';
    const stars = parseNumber(row.find(`a[href="/${owner}/${repo}/stargazers"]`).first().text());
    const forks = parseNumber(row.find(`a[href="/${owner}/${repo}/forks"]`).first().text());
    const today = compactText(row.find('span.float-sm-right').last().text());

    repos.push({
      rank: index + 1,
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
      desc,
      lang,
      langColor: langColor(lang, color),
      stars,
      forks,
      today
    });
  });

  return repos;
}

async function fetchTrendingPeriod(period) {
  const url = `https://github.com/trending?since=${period.since}`;
  const html = await fetchText(url);
  const repos = parseTrending(html);
  if (!repos.length) throw new Error(`No repositories parsed from ${url}`);
  return { label: period.label, sourceUrl: url, repos };
}

async function fetchYearly() {
  const query = new URLSearchParams({
    q: `created:>=${YEAR}-01-01 stars:>100`,
    sort: 'stars',
    order: 'desc',
    per_page: '30'
  });
  const res = await fetch(`https://api.github.com/search/repositories?${query}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'RepoPulseBot/1.0',
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {})
    }
  });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const repos = (data.items || []).slice(0, 30).map((item, index) => ({
    rank: index + 1,
    owner: item.owner?.login || '',
    repo: item.name,
    url: item.html_url,
    desc: item.description || '',
    lang: item.language || '',
    langColor: langColor(item.language || ''),
    stars: item.stargazers_count || 0,
    forks: item.forks_count || 0,
    today: ''
  }));

  return {
    label: '本年',
    sourceUrl: `https://github.com/search?q=${encodeURIComponent(`created:>=${YEAR}-01-01 stars:>100`)}&type=repositories&s=stars&o=desc`,
    repos
  };
}

async function readCache() {
  try {
    const cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
    return { version: 1, entries: {}, ...cache };
  } catch {
    return { version: 1, entries: {} };
  }
}

async function writeCache(cache) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function normalizeInsight(value, fallback) {
  return {
    summaryZh: compactText(value?.summaryZh || fallback.summaryZh).slice(0, 360),
    scenarios: Array.isArray(value?.scenarios) && value.scenarios.length
      ? value.scenarios.map(compactText).filter(Boolean).slice(0, 4)
      : fallback.scenarios,
    agentInstallPrompt: compactText(value?.agentInstallPrompt || fallback.agentInstallPrompt)
  };
}

function parseJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found');
  return JSON.parse(text.slice(start, end + 1));
}

async function callDeepSeek(repo) {
  const prompt = [
    '你是资深开源技术雷达编辑。基于一个 GitHub Trending 仓库信息，输出严格 JSON。',
    '字段：summaryZh（120-180字中文，说明项目用途、亮点、适合谁）、scenarios（三条中文适用场景）、agentInstallPrompt（一段可直接交给 AI coding agent 的中文安装/试跑提示词）。',
    '不要输出 Markdown，不要代码块，不要额外解释。',
    `仓库：${repo.owner}/${repo.repo}`,
    `URL：${repo.url}`,
    `语言：${repo.lang || '未知'}`,
    `描述：${repo.desc || '无'}`
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
        { role: 'system', content: 'You write concise Chinese product intelligence in strict JSON.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) throw new Error(`DeepSeek failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return parseJsonObject(json.choices?.[0]?.message?.content || '');
}

async function enrichReposWithInsights(periods) {
  const cache = await readCache();
  const unique = new Map();
  Object.values(periods).forEach((period) => {
    (period.repos || []).forEach((repo) => {
      unique.set(`${repo.owner}/${repo.repo}`, repo);
    });
  });

  let generated = 0;
  let reused = 0;
  let failed = 0;
  const insights = new Map();

  for (const [repoKey, repo] of unique) {
    const fallback = buildTemplateInsights(repo);
    const contentHash = hash({ owner: repo.owner, repo: repo.repo, desc: repo.desc, lang: repo.lang });
    const cacheKey = `repo:${repoKey}`;
    const cached = cache.entries[cacheKey];

    if (cached?.hash === contentHash && cached?.value) {
      insights.set(repoKey, normalizeInsight(cached.value, fallback));
      reused += 1;
      continue;
    }

    if (!DEEPSEEK_API_KEY || generated >= DEEPSEEK_MAX_SUMMARIES) {
      insights.set(repoKey, fallback);
      continue;
    }

    try {
      const value = normalizeInsight(await callDeepSeek(repo), fallback);
      cache.entries[cacheKey] = {
        type: 'repo-insight',
        hash: contentHash,
        model: DEEPSEEK_MODEL,
        generatedAt: new Date().toISOString(),
        value
      };
      await writeCache(cache);
      insights.set(repoKey, value);
      generated += 1;
      if (generated % 5 === 0) {
        console.log(`[DeepSeek] generated ${generated}, reused ${reused}, failed ${failed}`);
      }
    } catch (error) {
      console.warn(`[DeepSeek] ${repoKey}: ${error.message}`);
      insights.set(repoKey, fallback);
      failed += 1;
    }
  }

  Object.values(periods).forEach((period) => {
    period.repos = (period.repos || []).map((repo) => ({
      ...repo,
      ...(insights.get(`${repo.owner}/${repo.repo}`) || buildTemplateInsights(repo))
    }));
  });

  await writeCache(cache);
  return { enabled: Boolean(DEEPSEEK_API_KEY), model: DEEPSEEK_MODEL, generated, reused, failed, cacheEntries: Object.keys(cache.entries).length };
}

function scorePercent(item) {
  const score = Number(item.ai_score ?? item.score ?? 0);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(score <= 1 ? score * 100 : score);
}

function radarTitle(item) {
  return compactText(item.title_zh || item.title || item.title_en || '未命名更新');
}

function radarTime(item) {
  return item.published_at || item.first_seen_at || item.last_seen_at || '';
}

function normalizeRadarItem(item) {
  return {
    id: item.id || hash(item),
    title: radarTitle(item),
    titleEn: compactText(item.title_en || ''),
    url: item.url || '#',
    siteId: item.site_id || '',
    siteName: item.site_name || '来源',
    source: item.source || '未分区',
    publishedAt: radarTime(item),
    score: scorePercent(item),
    label: item.ai_label || 'ai_general',
    labelName: RADAR_LABELS[item.ai_label] || item.ai_label || 'AI 综合',
    reason: compactText(item.ai_relevance_reason || ''),
    signals: Array.isArray(item.ai_signals) ? item.ai_signals.filter(Boolean).slice(0, 5) : []
  };
}

function shouldKeepRadarItem(item) {
  const siteId = String(item.site_id || '').toLowerCase();
  const siteName = String(item.site_name || '').toLowerCase();
  return siteId !== 'followbuilders' && siteName !== 'follow builders';
}

function sortRadarItems(a, b) {
  return b.score - a.score || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

async function fetchRadar() {
  const sourceUrl = 'https://learnprompt.github.io/ai-news-radar/data/latest-24h.json';
  const payload = await fetchJson(sourceUrl);
  const items = (payload.items || payload.items_ai || [])
    .filter(shouldKeepRadarItem)
    .map(normalizeRadarItem)
    .sort(sortRadarItems);

  const categoryMap = new Map();
  items.forEach((item) => {
    if (!categoryMap.has(item.label)) {
      categoryMap.set(item.label, { id: item.label, label: item.labelName, count: 0, items: [] });
    }
    const category = categoryMap.get(item.label);
    category.count += 1;
    if (category.items.length < 10) category.items.push(item);
  });

  const categories = [...categoryMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  const picks = items.slice(0, 8);
  const sourceCount = new Set(items.map((item) => `${item.siteName}:${item.source}`)).size;

  return {
    title: 'AI 雷达',
    sourceUrl: 'https://learnprompt.github.io/ai-news-radar/',
    generatedAt: payload.generated_at || new Date().toISOString(),
    windowHours: payload.window_hours || 24,
    total: items.length,
    sourceCount,
    topScore: picks[0]?.score || 0,
    picks,
    categories
  };
}

async function main() {
  const entries = await Promise.all(PERIODS.map(async (period) => [period.key, await fetchTrendingPeriod(period)]));
  const yearly = await fetchYearly();
  const periods = Object.fromEntries([...entries, ['yearly', yearly]]);
  const deepseek = await enrichReposWithInsights(periods);
  const radar = await fetchRadar();

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'github-trending-search-ai-news-radar',
      timezone: 'Asia/Shanghai',
      refreshPolicy: 'Local launchd: 06:00 fetch, 07:00 commit and push',
      deepseek
    },
    periods,
    radar
  };

  await mkdir(path.dirname(OUTFILE), { recursive: true });
  await writeFile(OUTFILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const counts = Object.entries(periods).map(([key, period]) => `${key}:${period.repos.length}`).join(', ');
  console.log(`Wrote ${OUTFILE} (${counts}, radar:${radar.total}, deepseek generated:${deepseek.generated}, reused:${deepseek.reused})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
