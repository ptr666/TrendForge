# TrendForge

TrendForge 是一个本地优先的 AI 热点内容生产工作台。当前 Web 工作台第一阶段先收敛为 AIHot-only 流程：

```text
AIHot 日报 -> 选择信息 -> 热点分析 -> 查看原因/总结/评分 -> 人工勾选候选 -> 生成 review/微信公众号/小红书草稿 -> 运行历史
```

RSS/RSSHub 后端能力仍然保留，但前端订阅添加和渠道库入口暂时隐藏。这样可以先把 AIHot 到平台草稿的主链路做稳定，再逐步恢复多来源订阅。

## 当前能力

- Web 工作台：中文界面，展示 AIHot 日报、热点分析、候选评审、草稿生成、阻塞提醒、运行历史和基础配置。
- AIHot 固定源：自动获取最新 AI 热点，支持全选或逐条选择进入热点分析。
- 热点分析：只分析用户选择的 AIHot 条目，输出候选评分、入选原因、中文总结、风险提示和原文状态。
- 原文获取：候选入选后可通过 HTTP/RSS、BrowserAct planned command 或显式启用的 MediaCrawler fallback 补全原文。
- 草稿生成：支持 review、微信公众号、小红书三类本地产物和配图计划。
- 平台交接：微信走官方 API 工作流 gate，小红书走 Hermes/bridge/Chrome extension 工作流 gate；正式发布保持禁用。
- 运行历史：支持查看 run、events、artifacts、删除单条历史和清空全部历史。

## 快速开始

安装依赖：

```powershell
npm.cmd install --cache .\.npm-cache
```

构建和测试：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Windows 一键启动本地 API 和 Web 工作台：

```powershell
.\start-trendforge.bat
```

启动后访问：

- API: `http://127.0.0.1:4780`
- Web: `http://127.0.0.1:5173/`

停止本地服务：

```powershell
.\stop-trendforge.bat
```

运行日志写入：

- `workspace/api.log`
- `workspace/api.err.log`
- `workspace/web.log`
- `workspace/web.err.log`

## 模型配置

模型可在 Web 工作台的“配置”区域设置，也可使用环境变量：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

不要提交 API key、app secret、cookie、token、浏览器 profile 或账号截图。

## 主要 API

- `GET /health`
- `GET /sources/aihot/latest`
- `GET /config/model`, `PUT /config/model`, `POST /verify/model`
- `POST /pipeline/screen`
- `POST /pipeline/drafts`
- `GET /runs`, `DELETE /runs`, `GET /runs/:runId`, `DELETE /runs/:runId`
- `GET /runs/:runId/events`, `GET /runs/:runId/review-queue`
- `GET /items`, `GET /drafts`
- `GET /artifacts?path=<workspace/runs/...>`
- `GET /publishers`
- `GET /config/wechat`, `PUT /config/wechat`, `POST /verify/wechat`
- `GET /config/xhs`, `PUT /config/xhs`, `POST /verify/xhs`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`

RSS/RSSHub 相关 API 仍保留，供后续重新开放前端渠道库时使用。

## 文档

- [文档索引](docs/README.md)
- [完整使用流程](docs/usage-flow.md)
- [本地环境](docs/local-setup.md)
- [开发流程](docs/development.md)
- [项目进度](docs/project-progress.md)
- [外部项目与开源参考](docs/vendor-projects.md)
- [Git 工作流](docs/git-workflow.md)
- [维护手册](docs/maintenance-runbook.md)

## 开源参考

TrendForge 通过 adapter、本地 skill 或 planned command handoff 参考和集成以下项目：

- [RSSHub](https://github.com/DIYgod/RSSHub)
- [BrowserAct skills](https://github.com/browser-act/skills)
- [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)
- [autoclaw-cc/xiaohongshu-skills](https://github.com/autoclaw-cc/xiaohongshu-skills)
- [AIHot skill](https://aihot.virxact.com/aihot-skill/)
- `xhs-browser-draft-setup-package/`
- `wechat-official-account-shareable/`

维护版参考清单和本地使用边界见 [docs/vendor-projects.md](docs/vendor-projects.md)。
