import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const OUTFILE = path.resolve('public/data/trending.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
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

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  return raw ? Number(raw) : 0;
}

function langColor(lang, fallback = '') {
  return fallback || LANG_COLORS[lang] || '#8b949e';
}

function buildInsights(repo) {
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
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'RepoPulseBot/1.0 (+https://github.com/kingheshan/king-github-trending)'
    }
  });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
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

    const base = {
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
    };
    repos.push({ ...base, ...buildInsights(base) });
  });

  return repos;
}

async function fetchTrendingPeriod(period) {
  const url = `https://github.com/trending?since=${period.since}`;
  const html = await fetchText(url);
  const repos = parseTrending(html);
  if (!repos.length) {
    throw new Error(`No repositories parsed from ${url}`);
  }
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
  if (!res.ok) {
    throw new Error(`GitHub search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const repos = (data.items || []).slice(0, 30).map((item, index) => {
    const base = {
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
    };
    return { ...base, ...buildInsights(base) };
  });

  return {
    label: '本年',
    sourceUrl: `https://github.com/search?q=${encodeURIComponent(`created:>=${YEAR}-01-01 stars:>100`)}&type=repositories&s=stars&o=desc`,
    repos
  };
}

async function main() {
  const entries = await Promise.all(PERIODS.map(async (period) => [period.key, await fetchTrendingPeriod(period)]));
  const yearly = await fetchYearly();
  const periods = Object.fromEntries([...entries, ['yearly', yearly]]);

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'github-trending-and-search',
      timezone: 'Asia/Shanghai',
      refreshPolicy: 'GitHub Actions schedule: 12:00 Asia/Shanghai'
    },
    periods
  };

  await mkdir(path.dirname(OUTFILE), { recursive: true });
  await writeFile(OUTFILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const counts = Object.entries(periods).map(([key, period]) => `${key}:${period.repos.length}`).join(', ');
  console.log(`Wrote ${OUTFILE} (${counts})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
