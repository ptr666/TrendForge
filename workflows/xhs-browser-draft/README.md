# 小红书浏览器草稿工作流 Adapter

该目录用于 TrendForge 对小红书浏览器草稿工作流的封装说明。

当前来源工作流：

- 本地 skill package：`xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`
- 实现来源：`https://github.com/autoclaw-cc/xiaohongshu-skills`
- 运行桥接：Hermes + browser bridge + Chrome extension
- 角色：提供 share-safe 的 setup 和 troubleshooting，直到 `check-login`、`fill-publish`、`save-draft` 能可靠保存小红书草稿

Adapter 契约：

- Healthcheck：验证 Hermes、bridge server、浏览器扩展和登录态。
- Fill：先调用 `check-login`，再调用 `fill-publish`。
- Save：确认页面可见内容后，才调用 `save-draft`。
- Publish：只有用户显式操作后才调用 `publish`。
- 成功信号：浏览器页面显示明确的草稿已保存信号；命令成功本身不够。
- 环境：保留 macOS + Chrome 和 WSL + Windows Chrome 两类设置指导。

测试或默认骨架命令不得执行真实浏览器发布。
