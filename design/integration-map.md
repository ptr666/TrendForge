# 工作流映射

## 采集与原文补全工作流

TrendForge 将“简略信息采集”和“完整原文补全”分开：

- `aihot-source`：AI 热点信息最高优先级入口，优先使用 `https://aihot.virxact.com/aihot-skill/` 的 skill 信息，也可使用 AIHot RSS。
- `rsshub-source`：常规订阅和稳定来源，用于非 AIHot RSS/RSSHub route。
- `browseract-fetcher`：入选后处理疑难网页、动态网页和需要浏览器上下文的完整原文补全。
- `mediacrawler-fallback`：中文自媒体平台原文补全备用入口，必须显式启用并完成合规判断。

MediaCrawler 不作为默认采集入口。它只在 AIHot/RSS/RSSHub 已产生候选、BrowserAct 无法稳定补全原文，且用户配置允许时触发。

## 微信公众号工作流

项目入口：`wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`。

该 skill 管理 `wechat-official-account-shareable/wechat-official-account/` Node 工作流，适合映射为 `wechat-publisher` adapter；真实草稿链路使用微信官方 API。

核心输入：

- 文章 brief。
- Markdown 正文。
- 配置文件。
- 封面图策略。
- AppID / AppSecret / IP 白名单。

核心输出：

- 预览 HTML。
- 最终 HTML。
- 封面图来源与素材 `media_id`。
- 微信官方 API 草稿创建结果。
- 发布状态记录。

在 TrendForge 中的职责：

- 接收平台化成稿。
- 生成或接收 article brief / Markdown。
- 做格式检查。
- 处理封面与正文图片。
- 通过微信官方 API 创建公众号草稿。

## 小红书工作流

项目入口：`xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`。

该 skill 是围绕 `autoclaw-cc/xiaohongshu-skills`、Hermes、浏览器桥接和 Chrome 扩展的安装/验证/排障文档，目标是跑通小红书发布页填充、草稿保存和可选发布。它适合映射为 `xhs-browser-draft` adapter。

核心输入：

- 标题。
- 正文。
- 图片。
- 浏览器登录态。
- bridge 连接状态。
- Hermes 执行状态。
- share-safe 配置与脱敏要求。

核心输出：

- 发布页填充结果。
- 草稿保存结果。
- 页面真实状态信号。
- Hermes 命令执行结果。

在 TrendForge 中的职责：

- 接收小红书版成稿。
- 检查 Hermes、浏览器 bridge、Chrome 扩展和登录态是否可用。
- 填充发布页。
- 保存到草稿箱。

## 平台能力对应关系

| TrendForge 能力 | 微信公众号工作流 | 小红书工作流 |
| --- | --- | --- |
| 内容结构化 | article brief | 标题/正文/图片结构 |
| 平台改写 | Markdown 成稿 | 小红书风格成稿 |
| 图片策略 | 封面 + 正文图 | 图文发布图片 |
| 发布适配器 | `wechat-official-account-workflow` 指导下的微信官方 API 草稿创建 | `xhs-browser-draft-setup` 指导下的 `xiaohongshu-skills` + Hermes 浏览器草稿保存 |
| 成功信号 | 微信官方 API 草稿创建成功 | 页面显示草稿已保存，不能只看 Hermes 命令成功 |

## 采集适配器对应关系

| TrendForge 能力 | AIHot | RSSHub/RSS | BrowserAct | MediaCrawler |
| --- | --- | --- | --- | --- |
| AI 热点 | skill / RSS / API | 普通 RSS fallback | 入选后补全原文 | 非默认 |
| 常规订阅 | AIHot RSS | RSS URL 或 RSSHub route | 不负责 | 不负责 |
| 疑难网页 | 不负责 | 不负责 | 浏览器打开和抽取 | 仅 fallback |
| 中文自媒体平台 | 不负责 | 依赖 route | 浏览器补全 | 显式启用后的 detail fallback |
| 登录态复用 | 通常不需要 | 由 RSSHub route 决定 | 可复用浏览器上下文 | 可复用 CDP/登录态 |
| 默认启用 | 是 | 是 | 原文补全计划默认可用 | 否 |
| 触发方式 | AI 信息默认入口 | 普通订阅或 AIHot fallback 失败后 | 入选候选缺少完整原文时 | 显式开启后的最后 fallback |
