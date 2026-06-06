# TrendForge

TrendForge 是一个面向 AI 热点内容生产的本地工作台设计。

它把采集、验证、生成、媒体处理和发布拆成可插拔模块，并把两套现有工作流作为项目里的两个发布适配器：

- 公众号适配器：基于 `wechat-official-account-shareable` 中的 `wechat-official-account-workflow` skill，围绕 Markdown、article brief、AI 封面图、预览、检查和微信官方 API 草稿发布实现 API 型链路
- 小红书适配器：基于 `xhs-browser-draft-setup-package` 这份 share-safe skill 文档，围绕 `autoclaw-cc/xiaohongshu-skills`、Hermes、浏览器桥接、页面填充和草稿保存实现自动化链路

主流程是统一的：

1. 采集热点信息
2. 验证原文与完整性
3. 选材和打分
4. 生成平台化草稿
5. 生成图片和排版
6. 交给具体平台适配器发布

## 现有能力来源

- 公众号工作流蓝本：`wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`，它管理 `wechat-official-account-shareable/wechat-official-account/` Node 工作流，并通过微信官方 API 创建草稿
- 小红书工作流蓝本：`xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`，它是围绕 `autoclaw-cc/xiaohongshu-skills` 与 Hermes 的安装、验证、排障和分享版配置文档

## 采集策略

- AI HOT skill：AI 热点信息最高优先级入口，默认优先使用精选流；它也支持 RSS 接入。
- RSSHub：常规订阅和非 AI HOT RSS/RSSHub 路由入口。
- BrowserAct：疑难网页、登录网页、完整原文补采入口。
- MediaCrawler：自动备用采集器，只在明确启用且合规场景下使用。

## 项目结构

- `apps/api`：本地 HTTP API 入口。
- `apps/cli`：本地命令入口。
- `apps/web`：后续浏览器工作台占位。
- `packages/core`：领域模型和 pipeline 编排。
- `packages/sources`：RSSHub、BrowserAct、MediaCrawler 采集适配器。
- `packages/verifier`：原文验证与全文抽取。
- `packages/selector`：候选内容打分和 Top N 选择。
- `packages/generator`：平台化草稿生成。
- `packages/media`：图片和排版资产规划。
- `packages/publishers`：公众号和小红书发布适配器。
- `packages/storage`：本地运行状态存储。
- `workflows`：外部工作流封装入口，不默认下载外部项目。
- `workspace`：本地运行数据。

## 设计入口

- [架构说明](design/architecture.md)
- [项目结构](design/project-structure.md)
- [统一契约](design/trendforge-contracts.schema.json)
- [平台输出配置](design/platform-profiles.json)
- [工作流映射](design/integration-map.md)
- [采集适配器策略](design/source-adapters.md)

## 维护文档

- [文档索引](docs/README.md)
- [本地环境与运行](docs/local-setup.md)
- [外部项目管理](docs/vendor-projects.md)
- [Git 工作流](docs/git-workflow.md)
- [维护 Runbook](docs/maintenance-runbook.md)
