import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Circle,
  Copy,
  ExternalLink,
  Filter,
  GitFork,
  Github,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  TrendingUp
} from 'lucide-react';
import './styles.css';

const DATA_URL = `${import.meta.env.BASE_URL}data/trending.json`;
const PERIOD_ORDER = ['daily', 'weekly', 'monthly', 'yearly'];
const DEFAULT_DATA = {
  meta: { generatedAt: '', source: 'loading' },
  periods: {
    daily: { label: '今日', repos: [] },
    weekly: { label: '本周', repos: [] },
    monthly: { label: '本月', repos: [] },
    yearly: { label: '本年', repos: [] }
  }
};

function formatNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.0', '')}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k`;
  return String(n);
}

function formatDate(value) {
  if (!value) return '等待刷新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false
  }).format(date);
}

function useTrendingData() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, status };
}

function getPeriodKeys(periods) {
  const keys = Object.keys(periods || {});
  const ordered = PERIOD_ORDER.filter((key) => keys.includes(key));
  return [...ordered, ...keys.filter((key) => !ordered.includes(key))];
}

function getAllRepos(periods) {
  return Object.values(periods || {}).flatMap((period) => period.repos || []);
}

function rankTone(index) {
  if (index === 0) return 'rank-first';
  if (index === 1) return 'rank-second';
  if (index === 2) return 'rank-third';
  return '';
}

function RepoCard({ repo, index, expanded, copied, onToggle, onCopy }) {
  const heat = Math.min(100, Math.round(((repo.stars || 0) / 100000) * 100) + (index < 5 ? 18 : 6));
  const insightId = `${repo.owner}-${repo.repo}-${index}`;

  return (
    <article className={`repo-card ${expanded ? 'is-open' : ''}`}>
      <div className="repo-grid">
        <div className={`rank ${rankTone(index)}`}>{String(index + 1).padStart(2, '0')}</div>

        <div className="repo-main">
          <div className="repo-title-row">
            <a className="repo-title" href={repo.url} target="_blank" rel="noreferrer">
              <span>{repo.owner}</span>
              <span className="slash">/</span>
              <strong>{repo.repo}</strong>
              <ExternalLink aria-hidden="true" size={15} />
            </a>
            <button className="icon-button" type="button" aria-label="展开 AI 洞察" aria-expanded={expanded} aria-controls={insightId} onClick={onToggle}>
              <ChevronDown size={16} />
            </button>
          </div>

          {repo.desc && <p className="repo-desc">{repo.desc}</p>}

          <div className="repo-meta">
            {repo.lang && (
              <span className="meta-item">
                <Circle size={9} fill={repo.langColor || '#8b949e'} color={repo.langColor || '#8b949e'} />
                {repo.lang}
              </span>
            )}
            <span className="meta-item">
              <Star size={14} />
              {formatNumber(repo.stars)}
            </span>
            <span className="meta-item">
              <GitFork size={14} />
              {formatNumber(repo.forks)}
            </span>
            {repo.today && (
              <span className="meta-item today">
                <TrendingUp size={14} />
                {repo.today}
              </span>
            )}
          </div>
        </div>

        <div className="heat-cell" aria-label={`热度 ${heat}`}>
          <span>{heat}</span>
          <div className="heat-track">
            <i style={{ height: `${heat}%` }} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="ai-panel" id={insightId}>
          <section>
            <h3>
              <Sparkles size={14} />
              AI 摘要
            </h3>
            <p>{repo.summaryZh || '暂无摘要。'}</p>
          </section>

          <section>
            <h3>
              <Filter size={14} />
              适用场景
            </h3>
            <ul>
              {(repo.scenarios || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="prompt-section">
            <div className="panel-heading">
              <h3>
                <Bot size={14} />
                Agent 安装提示词
              </h3>
              <button className="copy-button" type="button" onClick={onCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <pre>{repo.agentInstallPrompt}</pre>
          </section>
        </div>
      )}
    </article>
  );
}

function LeftRail({ periodKeys, periods, period, setPeriod, languageStats, setLanguage }) {
  return (
    <aside className="rail left-rail">
      <div className="brand">
        <div className="brand-mark">
          <Github size={18} />
        </div>
        <div>
          <strong>RepoPulse</strong>
          <span>GitHub 热榜洞察</span>
        </div>
      </div>

      <nav className="period-nav" aria-label="周期">
        {periodKeys.map((key) => (
          <button key={key} type="button" className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>
            <span>{periods[key]?.label || key}</span>
            <em>{periods[key]?.repos?.length || 0}</em>
          </button>
        ))}
      </nav>

      <div className="rail-block">
        <h2>热门语言</h2>
        <div className="language-stack">
          {languageStats.slice(0, 6).map((item) => (
            <button key={item.lang} type="button" onClick={() => setLanguage(item.lang)}>
              <span style={{ background: item.color }} />
              {item.lang}
              <em>{item.count}</em>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function RightRail({ meta, repos, allRepos, periodLabel, status }) {
  const totalStars = repos.reduce((sum, repo) => sum + Number(repo.stars || 0), 0);
  const totalForks = repos.reduce((sum, repo) => sum + Number(repo.forks || 0), 0);
  const topLangs = Object.entries(
    repos.reduce((acc, repo) => {
      if (!repo.lang) return acc;
      acc[repo.lang] = (acc[repo.lang] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <aside className="rail right-rail">
      <div className="rail-block status-block">
        <div className="status-head">
          <RefreshCw size={16} />
          <span>{status === 'ready' ? '数据已加载' : status === 'error' ? '使用本地数据' : '加载中'}</span>
        </div>
        <strong>{formatDate(meta.generatedAt)}</strong>
        <p>{periodLabel}收录 {repos.length} 个项目，全站样本 {allRepos.length} 条。</p>
      </div>

      <div className="metric-grid">
        <div>
          <span>Stars</span>
          <strong>{formatNumber(totalStars)}</strong>
        </div>
        <div>
          <span>Forks</span>
          <strong>{formatNumber(totalForks)}</strong>
        </div>
      </div>

      <div className="rail-block">
        <h2>语言分布</h2>
        <div className="distribution">
          {topLangs.map(([lang, count]) => (
            <div key={lang} className="dist-row">
              <span>{lang}</span>
              <div>
                <i style={{ width: `${Math.max(12, (count / Math.max(1, repos.length)) * 100)}%` }} />
              </div>
              <em>{count}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="rail-block source-block">
        <h2>数据源</h2>
        <p>Trending 数据抓取自 github.com/trending，本年榜单使用 GitHub Search API。</p>
      </div>
    </aside>
  );
}

function App() {
  const { data, status } = useTrendingData();
  const periods = data.periods || DEFAULT_DATA.periods;
  const periodKeys = getPeriodKeys(periods);
  const [period, setPeriod] = useState(() => localStorage.getItem('repopulse:period') || periodKeys[0] || 'daily');
  const [language, setLanguage] = useState(() => localStorage.getItem('repopulse:language') || '');
  const [query, setQuery] = useState(() => localStorage.getItem('repopulse:query') || '');
  const [expanded, setExpanded] = useState(() => new Set(['0']));
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    if (!periods[period] && periodKeys[0]) setPeriod(periodKeys[0]);
  }, [period, periodKeys, periods]);

  useEffect(() => {
    localStorage.setItem('repopulse:period', period);
  }, [period]);

  useEffect(() => {
    localStorage.setItem('repopulse:language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('repopulse:query', query);
  }, [query]);

  const allRepos = useMemo(() => getAllRepos(periods), [periods]);
  const languages = useMemo(() => {
    const map = new Map();
    allRepos.forEach((repo) => {
      if (!repo.lang) return;
      const prev = map.get(repo.lang) || { lang: repo.lang, count: 0, color: repo.langColor || '#8b949e' };
      prev.count += 1;
      map.set(repo.lang, prev);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
  }, [allRepos]);

  const repos = periods[period]?.repos || [];
  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((repo) => {
      if (language && repo.lang !== language) return false;
      if (!q) return true;
      return [repo.owner, repo.repo, repo.desc, repo.summaryZh, repo.lang].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [repos, language, query]);

  const periodLabel = periods[period]?.label || period;

  function toggleExpanded(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyPrompt(repo, key) {
    const text = repo.agentInstallPrompt || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1500);
  }

  return (
    <main className="app-shell">
      <LeftRail
        periodKeys={periodKeys}
        periods={periods}
        period={period}
        setPeriod={setPeriod}
        languageStats={languages}
        setLanguage={setLanguage}
      />

      <section className="content">
        <header className="topbar">
          <div>
            <h1>GitHub Trending</h1>
            <p>中文摘要、场景判断和可直接交给 Agent 的安装提示词。</p>
          </div>
          <a className="github-link" href="https://github.com/trending" target="_blank" rel="noreferrer">
            <Github size={16} />
            GitHub Trending
            <ArrowUpRight size={14} />
          </a>
        </header>

        <section className="control-strip" aria-label="筛选条件">
          <label className="field">
            <span>Period</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {periodKeys.map((key) => (
                <option key={key} value={key}>
                  {periods[key]?.label || key}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="">All languages</option>
              {languages.map((item) => (
                <option key={item.lang} value={item.lang}>
                  {item.lang}
                </option>
              ))}
            </select>
          </label>

          <label className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search repo, owner, language or summary" />
          </label>
        </section>

        <div className="list-head">
          <div>
            <strong>{periodLabel}</strong>
            <span>{filteredRepos.length} / {repos.length} repos</span>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setLanguage('');
              setQuery('');
            }}
          >
            清除筛选
          </button>
        </div>

        <section className="repo-list" aria-label="仓库列表">
          {filteredRepos.length ? (
            filteredRepos.map((repo, index) => {
              const key = `${repo.owner}/${repo.repo}`;
              const expandedKey = `${index}`;
              return (
                <RepoCard
                  key={key}
                  repo={repo}
                  index={index}
                  expanded={expanded.has(expandedKey)}
                  copied={copiedKey === key}
                  onToggle={() => toggleExpanded(expandedKey)}
                  onCopy={() => copyPrompt(repo, key)}
                />
              );
            })
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <strong>没有匹配的项目</strong>
              <span>调整语言或关键词后再试。</span>
            </div>
          )}
        </section>
      </section>

      <RightRail meta={data.meta || {}} repos={repos} allRepos={allRepos} periodLabel={periodLabel} status={status} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
