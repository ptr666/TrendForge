# TrendForge Web 工作台

这是 TrendForge pipeline 的浏览器本地控制台。

当前能力：

- 在浏览器里配置 OpenAI-compatible 模型。密钥保存在本地被忽略的 workspace config 中，API 响应只返回脱敏预览。
- 配置微信公众号 `appId`、`appSecret` 和 `coverMediaId`，并触发后端 token 请求做健康验证。
- 从 `/publishers` 查看微信公众号 publisher gate 状态；真实草稿创建必须显式传入 `allowRealDraft=true`，并且 token/IP 白名单和封面素材就绪。
- 配置小红书浏览器工作流目录和 bridge URL，并查看真实浏览器草稿 gate。
- 管理 AIHot/RSS/RSSHub 订阅并验证来源。
- 按订阅源查看 source health，包括状态、错误分类、item 数量、检查时间和示例链接。
- 用可选择的 source mode、平台目标、`topN`、BrowserAct 和 MediaCrawler fallback flag 运行 AIHot/RSS pipeline。
- 查看 run history、阶段 event、入选 items、原文校验状态、中文总结、草稿和 publish handoff 结果。
- 查看 review/waiting queue，把缺失原文、生成总结、平台草稿和 publisher handoff 变成明确的人类控制点。
- 在真实平台草稿创建前审阅和审批 planned image assets。
- 通过 API-safe artifact reader 阅读已保存原文和草稿产物。
- 通过 shared Web types、API client、UI primitives 和聚焦的 panel components 保持工作台可维护。

工作台仍然禁用正式发布。微信公众号和小红书真实草稿创建都受显式 real-draft 请求和健康检查保护；小红书成功必须有页面级草稿已保存信号，不能只看命令退出码。
