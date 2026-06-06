# TrendForge

TrendForge 是一个本地优先的 AI 热点内容生产工作台。它把 AIHot/RSS 信号转成可审阅的中文总结、平台草稿、配图计划、发布工作流交接文件，以及受控的微信公众号/小红书草稿创建流程。

当前端到端流程是：

```text
AIHot/RSS 输入
-> 简略信息校验
-> 热点筛选
-> BrowserAct/MediaCrawler 原文获取
-> 中文总结
-> Review/微信公众号/小红书草稿
-> 图片资产规划与审批
-> 微信公众号/小红书草稿创建 gate
-> run history、events、artifacts、review queue 查询
```

正式发布默认禁用。真实创建平台草稿必须显式开启，并通过对应平台的健康检查。

## 当前能力

- API 后台：运行和查询本地 pipeline。
- CLI：支持 fixture 运行、本地 pipeline 运行、run history、events、sources、publishers 查询。
- Web 工作台：支持模型设置、订阅源管理、pipeline 运行、run history、artifact 阅读、review queue、图片资产审批和平台 gate 状态查看。
- AIHot 优先的信息源策略，AIHot RSS/RSSHub 作为订阅和 fallback 路径。
- BrowserAct 原文获取计划或命令式执行；MediaCrawler 只在显式启用并完成合规判断后作为 fallback。
- 默认使用确定性的本地 text provider，支持 OpenAI-compatible 模型接入。
- 微信公众号草稿 gate：基于 `appId`、`appSecret`、token 检查、`coverMediaId` 和官方草稿 API wrapper。
- 小红书浏览器草稿 gate：基于 `xhs-browser-draft-setup`、Hermes、bridge、Chrome 扩展、登录态检查和页面级“草稿已保存”信号。
- 图片资产默认规划：微信公众号 `16:9` 封面，小红书 `3:4` 图文资产。

## 快速开始

```powershell
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

启动本地 API：

```powershell
npm.cmd run api
```

另开终端启动 Web 工作台：

```powershell
npm.cmd run web:dev
```

运行内置 fixture：

```powershell
npm.cmd run cli -- run --run-id aihot-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id rss-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
npm.cmd run cli -- events --run-id rss-demo
```

## 本地配置

运行配置和产物写入 `workspace/`，该目录已被 Git 忽略。

模型可通过 Web 工作台配置，也可使用环境变量：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

不要提交 API key、app secret、cookie、token、浏览器 profile 或账号截图。

## 主要 API

- `POST /pipeline/run`
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `POST /runs/:runId/assets/:assetId/approve`
- `GET /sources`
- `GET /sources/health`
- `GET /publishers`
- `GET /config/model`, `PUT /config/model`
- `GET /config/wechat`, `PUT /config/wechat`, `POST /verify/wechat`
- `GET /config/xhs`, `PUT /config/xhs`, `POST /verify/xhs`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `GET /artifacts?path=<workspace/runs/...>`

## 项目结构

- `apps/api`：本地 HTTP API。
- `apps/cli`：本地 CLI 入口。
- `apps/web`：浏览器工作台。
- `packages/core`：pipeline 编排和领域类型。
- `packages/config`：source 默认值、订阅、本地模型/微信/小红书配置。
- `packages/sources`：AIHot、RSS/RSSHub、BrowserAct、MediaCrawler source adapter。
- `packages/verifier`：source item 校验和原文获取。
- `packages/selector`：打分和 Top N 筛选。
- `packages/providers`：BrowserAct provider、确定性 text provider、OpenAI-compatible text/selector provider。
- `packages/generator`：Review/微信公众号/小红书草稿生成。
- `packages/media`：图片资产规划。
- `packages/publishers`：微信公众号/小红书交接和真实草稿 gate。
- `packages/storage`：本地 run history 和 event 存储。
- `docs`：长期维护和开发文档。
- `workspace`：本地运行数据，默认不提交。

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

TrendForge 通过 adapter、本地 skill 或 planned command handoff 参考/集成以下项目：

- [RSSHub](https://github.com/DIYgod/RSSHub)
- [BrowserAct skills](https://github.com/browser-act/skills)
- [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)
- [autoclaw-cc/xiaohongshu-skills](https://github.com/autoclaw-cc/xiaohongshu-skills)
- [AIHot skill](https://aihot.virxact.com/aihot-skill/)
- `xhs-browser-draft-setup-package/`
- `wechat-official-account-shareable/`

维护版参考清单和本地使用边界见 [docs/vendor-projects.md](docs/vendor-projects.md)。
