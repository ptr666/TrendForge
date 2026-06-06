# TrendForge 架构说明

## 目标

TrendForge 将内容生产和平台草稿创建拆开，形成一条可观察、可回放、默认安全的本地生产主线：

```text
热点采集 -> 简略信息校验 -> 热点筛选 -> 原文获取 -> 单文总结 -> 平台成稿 -> 图片资产规划 -> 发布工作流交接/草稿 gate
```

正式发布不在当前默认链路内。真实平台副作用只允许“创建草稿”，并且必须显式开启并通过健康检查。

## 分层

### 1. 采集层

负责把简略信息放入候选池。

支持来源：

- AIHot skill / AIHot RSS。
- 用户配置的 RSS URL。
- RSSHub route 输出。
- 其他手动导入源。

AI 信息默认优先级：

```text
AIHot skill -> AIHot RSS -> RSS/RSSHub
```

BrowserAct 和 MediaCrawler 不作为普通采集入口。它们在内容入选后负责完整原文补全，其中 MediaCrawler 只在用户显式启用且合规时作为 fallback。

### 2. 校验与原文层

负责两件事：

- 判断 source item 是否有足够可信的简略信息。
- 为入选内容补全完整原文，或写入失败原因和 handoff。

校验层优先使用 AIHot/RSS 已提供的正文片段；摘要不足或原文缺失时，使用 BrowserAct 获取页面正文。中文自媒体平台或 BrowserAct 无法稳定获取的场景，可在合规允许时触发 MediaCrawler fallback。

### 3. 筛选层

负责从候选池中挑选符合当前目标的内容，并输出：

- 入选理由。
- 优先级/分数。
- 平台目标。
- 传播角度。

默认评分维度包括相关性、时效性、信息完整度、平台适配度和传播角度。

### 4. 总结与生成层

负责把完整原文转换为结构化中文总结，并生成不同平台草稿：

- 内部 Review 版。
- 微信公众号版。
- 小红书版。

默认 text provider 是确定性的本地 provider；真实模型通过 `TextProvider` seam 和 OpenAI-compatible 配置接入。

### 5. 媒体层

负责图片资产计划、prompt、比例和审批状态。

默认资产：

- 微信公众号封面：`16:9`。
- 小红书图文：`3:4`。

未配置真实 image provider 时，只输出 prompt-only 资产计划。

### 6. 发布适配器层

负责把平台草稿交给具体工作流。

- 微信公众号适配器：通过 `wechat-official-account-workflow` skill 管理的 Node 工作流和微信官方 API 创建草稿。
- 小红书适配器：通过 `xhs-browser-draft-setup` skill 管理的 `xiaohongshu-skills` + Hermes + bridge + Chrome extension 保存浏览器草稿。

默认只生成 planned command 和 handoff artifact。真实草稿创建必须显式启用并通过平台 gate。

## 现有工作流如何接入

### 微信公众号工作流

入口：`wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`。

该 skill 管理 `wechat-official-account-shareable/wechat-official-account/` Node 工作流，用于将选题或 article brief 转换为 Markdown、AI/本地封面、预览、健康检查和微信公众号草稿。

已提供契约：

- `article-brief.schema.json`
- `config.example.json`
- `compose-and-publish.js`
- `render-wechat-preview.js`
- `wechat-final.js`
- `chat-publish-template.md`
- `references/setup-and-config.md`
- `references/usage-and-capabilities.md`
- `references/troubleshooting.md`

在 TrendForge 中，它承担“微信公众号发布适配器”的角色。真实链路使用微信官方 API 上传封面/正文图片并创建草稿；测试和默认命令不得直接正式发布。

### 小红书工作流

入口：`xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`。

这是一个 share-safe 的安装、验证、排障和配置辅助 skill，用来围绕开源项目 `autoclaw-cc/xiaohongshu-skills` 与 Hermes 跑通浏览器桥接、发布页填充和草稿保存。它强调完成标准是稳定保存草稿，而不是仅打开页面或命令返回成功。

关键能力包括：

- `check-login`
- `fill-publish`
- `save-draft`
- `publish`
- Hermes 调度/执行层。
- bridge server。
- Chrome 扩展。
- macOS + Chrome 与 WSL + Windows Chrome 两类环境拓扑。
- 分享文档脱敏规则。

在 TrendForge 中，它承担“小红书浏览器草稿适配器”的角色。

## 状态与追踪

每条内容都应记录：

- 来源。
- 采集 adapter。
- 原文 URL。
- 校验状态。
- 合规检查状态。
- 是否入选。
- 生成了哪些平台版本。
- 图片资产审批状态。
- 平台 handoff 或真实草稿 gate 状态。
- run event 和 artifact path。

## 当前边界

当前已经覆盖：

- 本地 API、CLI 和 Web 工作台。
- 单人单账号的内容生产主线。
- AIHot/RSS/RSSHub 采集。
- BrowserAct/MediaCrawler 原文获取 seam。
- Review/微信公众号/小红书草稿生成。
- 图片资产计划和审批。
- 微信公众号/小红书真实草稿 gate。

暂不强行实现：

- 多租户权限。
- 云端队列。
- 多账号统一后台。
- 大规模抓取。
- 绕过平台访问限制。
- 正式自动发布。
