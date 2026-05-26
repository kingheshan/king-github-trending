# RepoPulse

RepoPulse 是一个 GitHub Trending 中文洞察站点，复刻 `github-trending.yuanqi.blog` 的核心功能，并升级为更适合长期浏览和筛选的暗色开发者情报面板。

## 功能

- 今日、本周、本月、本年榜单切换
- 语言过滤和关键词搜索
- 仓库星标、fork、趋势增量和热度展示
- 中文摘要、适用场景、Agent 安装提示词
- DeepSeek API 生成摘要，并用 `data/deepseek-cache.json` 缓存，避免重复消耗 token
- AI 雷达：整合 `AI News Radar` 过去 24 小时热门 AI/科技信号，按分类展开每类 Top 10
- 一键复制提示词
- 本地 launchd 每天 06:00 抓取、07:00 提交并发布
- GitHub Pages 静态部署

## 本地开发

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY
npm run update-data
npm run dev
```

如果没有 `DEEPSEEK_API_KEY`，脚本会使用模板摘要继续生成页面，不会阻断日更。

## 本地自动化

```bash
npm run install:local-automation
```

安装后会创建两个 macOS LaunchAgent：

- `com.repopulse.fetch`：每天 06:00 执行 `npm run local:fetch`
- `com.repopulse.publish`：每天 07:00 执行 `npm run local:publish`

日志写入 `logs/` 目录。07:00 任务会先运行构建检查，再提交 `public/data/trending.json` 和 `data/deepseek-cache.json` 的变更并推送到 GitHub。

## 部署

仓库包含 GitHub Pages 工作流。推送到 `main` 后会自动构建并发布。数据更新工作流保留手动触发入口，日常更新由本地自动化负责。
