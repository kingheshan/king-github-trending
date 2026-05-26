# RepoPulse

RepoPulse 是一个 GitHub Trending 中文洞察站点，复刻 `github-trending.yuanqi.blog` 的核心功能，并升级为更适合长期浏览和筛选的暗色开发者情报面板。

## 功能

- 今日、本周、本月、本年榜单切换
- 语言过滤和关键词搜索
- 仓库星标、fork、趋势增量和热度展示
- 中文摘要、适用场景、Agent 安装提示词
- 一键复制提示词
- GitHub Actions 每天北京时间 12:00 更新数据
- GitHub Pages 静态部署

## 本地开发

```bash
npm install
npm run update-data
npm run dev
```

## 部署

仓库包含 GitHub Pages 工作流。推送到 `main` 后会自动构建并发布。数据更新工作流会每天运行，也可以在 Actions 页面手动触发。
