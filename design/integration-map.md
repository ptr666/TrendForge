# 工作流映射

## 采集工作流

TrendForge 的采集层分三档：

- `aihot-source`：AI 热点信息最高优先级入口，优先使用 `https://aihot.virxact.com/aihot-skill/` 的 skill 信息，也可使用 AI HOT RSS。
- `rsshub-source`：常规订阅和稳定源，用于非 AI HOT RSS/RSSHub 路由。
- `browseract-fetcher`：疑难网页和需要浏览器上下文的完整原文补采。
- `mediacrawler-fallback`：中文自媒体平台备用采集器，必须显式启用。

MediaCrawler 不作为默认采集入口；它只在 AI HOT/RSSHub 无结果、BrowserAct 也无法稳定补采，且用户配置允许时触发。

## 公众号工作流

这套工作流的项目入口是 `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`。该 skill 管理 `wechat-official-account-shareable/wechat-official-account/` Node 工作流，适合映射为 `wechat-publisher` 适配器；真实发布链路使用微信官方 API。

核心输入：

- 文章 brief
- Markdown 正文
- 配置文件
- 封面图策略
- AppID / AppSecret / IP 白名单

核心输出：

- 预览 HTML
- 最终 HTML
- 封面图来源与素材 `media_id`
- 微信官方 API 草稿箱结果
- 发布状态记录

它在 TrendForge 里的职责是：

- 接收平台化成稿
- 生成或接收 article brief / Markdown
- 做格式检查
- 处理封面与正文图片
- 通过微信官方 API 创建公众号草稿

## 小红书工作流

这套工作流的项目入口是 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`。该 skill 是围绕 `autoclaw-cc/xiaohongshu-skills`、Hermes、浏览器桥接和 Chrome 扩展的安装/验证/排障文档，目标是跑通小红书发布页填充、草稿保存和可选发布。它适合映射为 `xhs-browser-draft` 适配器。

核心输入：

- 标题
- 正文
- 图片
- 浏览器登录态
- bridge 连接状态
- Hermes 执行状态
- share-safe 配置与脱敏要求

核心输出：

- 发布页填充结果
- 草稿保存结果
- 页面真实状态信号
- Hermes 命令执行结果

它在 TrendForge 里的职责是：

- 接收小红书版成稿
- 检查 Hermes、浏览器桥接、Chrome 扩展和登录态是否可用
- 填充发布页
- 保存到草稿箱

## 对应关系

| TrendForge 能力 | 公众号工作流 | 小红书工作流 |
| --- | --- | --- |
| 内容结构化 | article brief | 标题/正文/图片结构 |
| 平台改写 | Markdown 成稿 | 小红书风格成稿 |
| 图片策略 | 封面 + 正文图 | 图文发布图片 |
| 发布适配器 | `wechat-official-account-workflow` 指导下的微信官方 API 草稿发布 | `xhs-browser-draft-setup` 指导下的 `xiaohongshu-skills` + Hermes 浏览器草稿保存 |
| 成功信号 | 微信官方 API 草稿创建成功 | 页面显示草稿已保存，且 Hermes 命令返回成功 |

## 采集适配器对应关系

| TrendForge 能力 | AI HOT | RSSHub | BrowserAct | MediaCrawler |
| --- | --- | --- | --- | --- |
| AI 热点 | skill / RSS / API | 普通 RSS 备用 | 补采原文 | 不默认负责 |
| 常规订阅 | AI HOT RSS | RSS URL | 不负责 | 不负责 |
| 疑难网页 | 不负责 | 不负责 | 浏览器打开和抽取 | 仅备用 |
| 中文自媒体平台 | 不负责 | 依赖 route | 浏览器补采 | 关键词/详情备用采集 |
| 登录态复用 | 不需要 | 由 RSSHub route 决定 | 复用浏览器上下文 | 复用 CDP/登录态 |
| 默认启用 | 是 | 是 | 是 | 否 |
| 触发方式 | AI 信息默认入口 | 普通订阅或 AI HOT 失败后 | 验证/全文失败后 | 显式开启后的最后兜底 |
