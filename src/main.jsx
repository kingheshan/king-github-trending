import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Circle,
  Clipboard,
  Copy,
  ExternalLink,
  Flame,
  GitFork,
  Github,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Zap
} from 'lucide-react';
import './styles.css';

const DATA_URL = `${import.meta.env.BASE_URL}data/trending.json`;
const PERIOD_ORDER = ['daily', 'weekly', 'monthly', 'yearly'];
const DEFAULT_DATA = {
  meta: { generatedAt: '', source: 'loading', deepseek: null },
  periods: {
    daily: { label: '今日', repos: [] },
    weekly: { label: '本周', repos: [] },
    monthly: { label: '本月', repos: [] },
    yearly: { label: '本年', repos: [] }
  },
  radar: { total: 0, sourceCount: 0, picks: [], categories: [] }
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
          setData({ ...DEFAULT_DATA, ...json });
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

function labelHeat(value) {
  if (value >= 90) return '极热';
  if (value >= 75) return '很热';
  if (value >= 60) return '热门';
  return '观察';
}

function repoHeat(repo, index) {
  const starScore = Math.min(58, Math.round(Math.log10(Math.max(10, repo.stars || 0)) * 12));
  const trendScore = repo.today ? 22 : 8;
  const rankScore = Math.max(0, 20 - index * 2);
  return Math.min(100, starScore + trendScore + rankScore);
}

function periodDelta(repo, periodLabel) {
  if (repo.today) return repo.today.replace(' stars today', '').replace(' stars this week', '');
  return periodLabel === '本年' ? 'new' : '-';
}

function ShellNav({ activeView, setActiveView, periodKeys, periods, period, setPeriod, radar }) {
  return (
    <aside className="side-shell">
      <div className="brand">
        <div className="brand-mark">
          <Zap size={18} />
        </div>
        <strong>RepoPulse</strong>
      </div>

      <nav className="view-nav" aria-label="主导航">
        <button className={activeView === 'trending' ? 'active' : ''} type="button" onClick={() => setActiveView('trending')}>
          <TrendingUp size={16} />
          趋势榜
        </button>
        <button className={activeView === 'radar' ? 'active' : ''} type="button" onClick={() => setActiveView('radar')}>
          <Flame size={16} />
          AI 雷达
          <em>{formatNumber(radar.total)}</em>
        </button>
      </nav>

      <div className="nav-section">
        <h2>周期</h2>
        {periodKeys.map((key) => (
          <button key={key} className={period === key ? 'active' : ''} type="button" onClick={() => setPeriod(key)}>
            <span>{periods[key]?.label || key}</span>
            <em>{periods[key]?.repos?.length || 0}</em>
          </button>
        ))}
      </div>

      <div className="nav-section muted-links">
        <h2>分类</h2>
        <span>AI / 大模型</span>
        <span>开发工具</span>
        <span>后端</span>
        <span>前端</span>
        <span>数据科学</span>
      </div>
    </aside>
  );
}

function HeaderControls({ activeView, periodKeys, periods, period, setPeriod, language, setLanguage, languages, query, setQuery }) {
  return (
    <header className="app-header">
      <div className="header-title">
        <span className="pulse-mark" />
        <strong>RepoPulse</strong>
        <span>每日 07:00 更新</span>
      </div>

      <div className="top-controls">
        {activeView === 'trending' && (
          <>
            <label>Period</label>
            <div className="segment">
              {periodKeys.map((key) => (
                <button key={key} className={period === key ? 'active' : ''} type="button" onClick={() => setPeriod(key)}>
                  {periods[key]?.label || key}
                </button>
              ))}
            </div>

            <label>Language</label>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Language">
              <option value="">All</option>
              {languages.map((item) => (
                <option key={item.lang} value={item.lang}>
                  {item.lang}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="search-box">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder={activeView === 'radar' ? '搜索 AI 信号 / 来源' : '搜索仓库、关键词...'}
          />
        </label>
      </div>
    </header>
  );
}

function RepoRow({ repo, index, periodLabel, expanded, copied, onToggle, onCopy }) {
  const heat = repoHeat(repo, index);
  const insightId = `${repo.owner}-${repo.repo}-${index}`;

  function handleRowKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onToggle();
  }

  return (
    <article className={`repo-row ${expanded ? 'open' : ''}`}>
      <div
        className="repo-line"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={insightId}
        onClick={onToggle}
        onKeyDown={handleRowKeyDown}
      >
        <div className="rank-cell">
          <strong>{index + 1}</strong>
          {index < 3 && <span>▲ {3 - index}</span>}
        </div>

        <div className="repo-cell">
          <a href={repo.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            <span>{repo.owner}</span> / <strong>{repo.repo}</strong>
            <ExternalLink size={13} />
          </a>
          <p>{repo.desc || 'No description.'}</p>
          <div className="tags">
            {(repo.lang || '').split(',').filter(Boolean).slice(0, 1).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            {repo.summaryZh && <span>AI摘要</span>}
          </div>
        </div>

        <div className="lang-cell">
          {repo.lang && <i style={{ background: repo.langColor || '#8b949e' }} />}
          <span>{repo.lang || '-'}</span>
        </div>
        <div className="metric-cell">
          <Star size={14} />
          {formatNumber(repo.stars)}
        </div>
        <div className="metric-cell">
          <GitFork size={14} />
          {formatNumber(repo.forks)}
        </div>
        <div className="delta-cell">{periodDelta(repo, periodLabel)}</div>
        <div className="heat-cell">
          <div className="bars" style={{ '--heat': `${heat}%` }} />
          <strong>{heat}</strong>
          <span>{labelHeat(heat)}</span>
        </div>
        <button
          className="row-toggle"
          type="button"
          aria-label={expanded ? '收起 AI 摘要' : '展开 AI 摘要'}
          aria-expanded={expanded}
          aria-controls={insightId}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {expanded && (
        <div className="repo-insight" id={insightId}>
          <section>
            <h3>
              <Clipboard size={15} />
              AI 摘要
            </h3>
            <p>{repo.summaryZh || '暂无摘要。'}</p>
          </section>
          <section>
            <h3>
              <Sparkles size={15} />
              适用场景
            </h3>
            <ul>
              {(repo.scenarios || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="insight-title">
              <h3>
                <Bot size={15} />
                Agent 安装提示词
              </h3>
              <button type="button" onClick={onCopy}>
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

function TrendingView({ repos, filteredRepos, periodLabel, expanded, copiedKey, toggleExpanded, copyPrompt }) {
  return (
    <section className="board">
      <div className="table-head">
        <span>#</span>
        <span>仓库</span>
        <span>语言</span>
        <span>Stars</span>
        <span>Forks</span>
        <span>{periodLabel === '本周' ? '本周新增' : '今日新增'}</span>
        <span>热度</span>
      </div>

      <div className="repo-list">
        {filteredRepos.length ? (
          filteredRepos.map((repo, index) => {
            const key = `${repo.owner}/${repo.repo}`;
            const expandedKey = `${index}`;
            return (
              <RepoRow
                key={key}
                repo={repo}
                index={index}
                periodLabel={periodLabel}
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
            <span>调整普通搜索或语言筛选后再试。</span>
          </div>
        )}
      </div>

      <div className="board-foot">{filteredRepos.length} / {repos.length} repos</div>
    </section>
  );
}

function RadarItem({ item, rank }) {
  return (
    <a className="radar-item" href={item.url} target="_blank" rel="noreferrer">
      <div className="radar-time">
        <span>#{rank}</span>
        <time>{formatDate(item.publishedAt)}</time>
      </div>
      <div>
        <div className="radar-meta">
          <span>{item.siteName}</span>
          <strong>{item.score || 60}分</strong>
          {item.signals.slice(0, 2).map((signal) => (
            <span key={signal}>{signal}</span>
          ))}
        </div>
        <h3>{item.title}</h3>
        <p>{item.source}</p>
      </div>
    </a>
  );
}

function RadarView({ radar, query }) {
  const [open, setOpen] = useState(() => new Set(['model_release', 'ai_general']));
  const q = query.trim().toLowerCase();
  const categories = (radar.categories || [])
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => {
        if (!q) return true;
        return `${item.title} ${item.siteName} ${item.source} ${item.signals?.join(' ')}`.toLowerCase().includes(q);
      })
    }))
    .filter((category) => category.items.length);

  function toggle(id) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="radar-board">
      <div className="radar-hero">
        <div>
          <span>AI RADAR</span>
          <h2>AI 雷达</h2>
          <p>整合过去 {radar.windowHours || 24} 小时 AI/科技方向高热内容，按信号强度与主题分类展示重点更新。</p>
        </div>
        <a href={radar.sourceUrl || 'https://learnprompt.github.io/ai-news-radar/'} target="_blank" rel="noreferrer">
          原始雷达
          <ArrowUpRight size={14} />
        </a>
      </div>

      <div className="radar-metrics">
        <div>
          <span>AI 信号</span>
          <strong>{formatNumber(radar.total)}</strong>
        </div>
        <div>
          <span>来源分组</span>
          <strong>{formatNumber(radar.sourceCount)}</strong>
        </div>
        <div>
          <span>最高评分</span>
          <strong>{radar.topScore || 0}</strong>
        </div>
      </div>

      <section className="bole-panel">
        <div className="section-head">
          <div>
            <span>BOLE PICKS</span>
            <h2>伯乐精选</h2>
          </div>
          <em>Top 8 · 按评分排序</em>
        </div>
        <div className="bole-list">
          {(radar.picks || []).slice(0, 8).map((item, index) => (
            <RadarItem key={item.id} item={item} rank={index + 1} />
          ))}
        </div>
      </section>

      <section className="signal-panel">
        <div className="section-head">
          <div>
            <span>SIGNAL FLOW</span>
            <h2>AI 信号流</h2>
          </div>
          <em>按分类展开 · 每类 Top 5</em>
        </div>

        <div className="category-list">
          {categories.map((category) => {
            const isOpen = open.has(category.id);
            return (
              <section className="category-group" key={category.id}>
                <button type="button" onClick={() => toggle(category.id)} aria-expanded={isOpen}>
                  <strong>{category.label}</strong>
                  <span>{formatNumber(category.count)} 条</span>
                  <ChevronDown size={16} />
                </button>
                {isOpen && (
                  <div className="category-items">
                    {category.items.slice(0, 5).map((item, index) => (
                      <RadarItem key={item.id} item={item} rank={index + 1} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function InsightRail({ activeView, meta, repos, allRepos, radar, periodLabel, status }) {
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
    <aside className="insight-rail">
      <div className="rail-card">
        <h2>洞察</h2>
        <strong>{status === 'ready' ? '数据已加载' : status === 'error' ? '加载失败' : '加载中'}</strong>
        <p>{formatDate(meta.generatedAt)} · {activeView === 'radar' ? `${formatNumber(radar.total)} 条 AI 信号` : `${periodLabel} ${repos.length} 个项目`}</p>
      </div>

      <div className="rail-card metric-pair">
        <div>
          <span>样本</span>
          <strong>{activeView === 'radar' ? formatNumber(radar.sourceCount) : formatNumber(allRepos.length)}</strong>
        </div>
        <div>
          <span>缓存</span>
          <strong>{formatNumber(meta.deepseek?.cacheEntries || 0)}</strong>
        </div>
      </div>

      {activeView === 'trending' && (
        <div className="rail-card">
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
      )}

      <div className="rail-card">
        <h2>刷新信息</h2>
        <p>本地 06:00 抓取数据，07:00 自动提交并触发 GitHub Pages 部署。</p>
      </div>
    </aside>
  );
}

function App() {
  const { data, status } = useTrendingData();
  const periods = data.periods || DEFAULT_DATA.periods;
  const radar = data.radar || DEFAULT_DATA.radar;
  const periodKeys = getPeriodKeys(periods);
  const [activeView, setActiveView] = useState(() => localStorage.getItem('repopulse:view') || 'trending');
  const [period, setPeriod] = useState(() => localStorage.getItem('repopulse:period') || periodKeys[0] || 'daily');
  const [language, setLanguage] = useState(() => localStorage.getItem('repopulse:language') || '');
  const [query, setQuery] = useState(() => localStorage.getItem('repopulse:query') || '');
  const [expanded, setExpanded] = useState(() => new Set(['0']));
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    if (!periods[period] && periodKeys[0]) setPeriod(periodKeys[0]);
  }, [period, periodKeys, periods]);

  useEffect(() => localStorage.setItem('repopulse:view', activeView), [activeView]);
  useEffect(() => localStorage.setItem('repopulse:period', period), [period]);
  useEffect(() => localStorage.setItem('repopulse:language', language), [language]);
  useEffect(() => localStorage.setItem('repopulse:query', query), [query]);

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
    <main className="app-frame">
      <ShellNav
        activeView={activeView}
        setActiveView={setActiveView}
        periodKeys={periodKeys}
        periods={periods}
        period={period}
        setPeriod={setPeriod}
        radar={radar}
      />

      <section className="main-stage">
        <HeaderControls
          activeView={activeView}
          periodKeys={periodKeys}
          periods={periods}
          period={period}
          setPeriod={setPeriod}
          language={language}
          setLanguage={setLanguage}
          languages={languages}
          query={query}
          setQuery={setQuery}
        />

        {activeView === 'trending' ? (
          <TrendingView
            repos={repos}
            filteredRepos={filteredRepos}
            periodLabel={periodLabel}
            expanded={expanded}
            copiedKey={copiedKey}
            toggleExpanded={toggleExpanded}
            copyPrompt={copyPrompt}
          />
        ) : (
          <RadarView radar={radar} query={query} />
        )}
      </section>

      <InsightRail activeView={activeView} meta={data.meta || {}} repos={repos} allRepos={allRepos} radar={radar} periodLabel={periodLabel} status={status} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
