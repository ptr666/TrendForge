# 微信公众号工作流 Adapter

该目录用于 TrendForge 对微信公众号工作流的封装说明。

当前来源工作流：

- Skill 入口：`wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`
- Node 工作流：`wechat-official-account-shareable/wechat-official-account/`

该工作流将 article brief 或 Markdown 转成微信公众号草稿。它负责本地预览、健康检查、AI 或本地封面策略、图片上传、幂等状态和微信官方 API 草稿创建。

Adapter 契约：

- 输入：platform draft、article brief、Markdown 正文、封面策略。
- Preview：在被封装工作流内调用 `npm run preview`。
- Check：调用 `npm run check`。
- Compose：从 article brief 开始时调用 `npm run compose`。
- Publish：只有在用户显式操作、官方 API 凭证有效并确认 IP 白名单配置后，才允许调用 `npm run publish`。
- Force publish：只有明确要求覆盖重复保护时，才允许调用 `npm run publish:force`。
- 成功信号：检查 `state/published.json` 和 `output/article-final.html`；API 成功不一定总是包含 `errcode: 0`。

测试或默认骨架命令不得执行真实发布。
