# TrendForge

TrendForge 是一个本地优先的 AI 热点内容生产工作台。它把 AIHot/RSS 信息采集、热点筛选、原文获取、中文总结、多平台草稿、配图规划和平台草稿创建拆成可观察、可测试、可接力的端到端 pipeline。

第一阶段重点不是先做完整 CMS，而是打通一条可运行的后台和 Web 工作台：

```text
AIHot/RSS 输入
-> 简略信息筛选
-> BrowserAct/MediaCrawler 原文获取
-> 中文总结
-> Review/WeChat/XHS 草稿
-> 图片资产规划
-> 平台发布 handoff
-> run history / events / artifacts 复盘
```

## 当前能力

- Web 工作台：管理模型配置、微信公众号配置、RSS/AIHot 订阅源、pipeline 运行参数、运行历史、事件、原文和草稿 artifact。
- API 后台：提供 `/pipeline/run`、`/runs`、`/runs/:id/events`、`/subscriptions`、`/config/model`、`/config/wechat`、`/verify/wechat` 等本地接口。
- CLI：支持本地运行 pipeline、查询 runs/events/items/drafts。
- AIHot 优先：默认优先使用 AIHot skill/public feed，RSS/RSSHub 作为订阅和 fallback 入口。
- 原文获取：BrowserAct 是默认原文补全方案；MediaCrawler 作为显式启用且需要合规检查的 fallback。
- 中文内容：默认 provider 和 OpenAI-compatible provider prompt 都要求输出简体中文摘要和选题理由。
- 微信公众号：Web 可配置 `appId`/`appSecret`，后台可真实请求微信官方 token 接口；真实草稿创建仍受显式开关、凭证和 IP 白名单 gate 保护。
- 小红书：当前生成 XHS 草稿和 browser draft planned commands；真实保存草稿需要 Hermes/bridge/Chrome extension/login health gate。

## 本地运行

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run api
npm.cmd run web:dev
```

默认 API 地址是 `http://127.0.0.1:4780`，Web dev server 默认由 Vite 启动。生产打包检查：

```powershell
npm.cmd run web:build
```

## 配置与安全

模型和微信公众号配置由 Web 工作台写入本地 `workspace/config/`，该目录已被 `.gitignore` 忽略。

推荐模型配置：

- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-flash`
- API key: 只在本地 Web 工作台或环境变量中配置，不提交到仓库。

相关环境变量：

- `TRENDFORGE_MODEL_BASE_URL`
- `TRENDFORGE_MODEL_API_KEY`
- `TRENDFORGE_MODEL_NAME`
- `TRENDFORGE_TEXT_PROVIDER=openai-compatible`
- `TRENDFORGE_ENABLE_BROWSERACT=1`
- `TRENDFORGE_BROWSERACT_COMMAND`
- `TRENDFORGE_CONFIG_DIR`
- `TRENDFORGE_RUNS_DIR`

## 项目结构

- `apps/api`: 本地 HTTP API。
- `apps/cli`: 本地命令行入口。
- `apps/web`: 浏览器工作台。
- `packages/core`: pipeline 编排和领域类型。
- `packages/config`: 默认配置、订阅源、本地模型/微信配置。
- `packages/sources`: AIHot、RSS/RSSHub、BrowserAct/MediaCrawler source adapter。
- `packages/verifier`: 原文验证。
- `packages/selector`: 候选内容评分和 Top N 选择。
- `packages/providers`: BrowserAct、默认文本 provider、OpenAI-compatible 文本/选择 provider。
- `packages/generator`: Review/WeChat/XHS 草稿生成。
- `packages/media`: 图片和排版资产规划。
- `packages/publishers`: WeChat/XHS publisher handoff 和微信 token 请求 helper。
- `packages/storage`: 本地 run history 和 events 存储。
- `design`: 架构、契约和平台 profile。
- `docs`: 长期维护文档。
- `workspace`: 本地运行数据和 artifact，不作为源码提交。

## 参考与接入的开源项目

TrendForge 通过 adapter/workflow 的方式参考和接入以下项目。详细维护说明见 [docs/vendor-projects.md](docs/vendor-projects.md)。

- [RSSHub](https://github.com/DIYgod/RSSHub): 通用 RSS/RSSHub 订阅能力参考和接入目标。
- [BrowserAct skills](https://github.com/browser-act/skills): 浏览器自动化原文获取和动态页面验证能力参考。
- [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler): 中文内容平台采集 fallback 参考，默认禁用，需要显式启用和合规检查。
- [autoclaw-cc/xiaohongshu-skills](https://github.com/autoclaw-cc/xiaohongshu-skills): 小红书 Hermes/bridge/Chrome extension 草稿链路的实现来源。
- `xhs-browser-draft-setup-package/`: 基于上面小红书技能整理的本地 share-safe skill 包，用于 TrendForge 的 XHS planned commands 和 health gate。
- `wechat-official-account-shareable/`: 微信公众号 Node 工作流参考，底层使用微信官方 API 做素材上传和草稿创建。
- [AIHot skill](https://aihot.virxact.com/aihot-skill/): TrendForge 当前最高优先级的 AI 热点信息来源，同时支持 RSS/REST fallback。

## 设计与维护文档

- [文档索引](docs/README.md)
- [开发流程](docs/development.md)
- [项目推进状态](docs/project-progress.md)
- [本地环境与运行](docs/local-setup.md)
- [外部项目管理](docs/vendor-projects.md)
- [Git 工作流](docs/git-workflow.md)
- [维护 Runbook](docs/maintenance-runbook.md)
- [架构说明](design/architecture.md)
- [项目结构设计](design/project-structure.md)
- [统一契约](design/trendforge-contracts.schema.json)
- [平台输出配置](design/platform-profiles.json)
- [集成映射](design/integration-map.md)
- [采集适配器策略](design/source-adapters.md)
