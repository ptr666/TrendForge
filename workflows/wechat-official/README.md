# WeChat Official Workflow Adapter

This directory is reserved for the wrapped WeChat Official Account workflow.

Current source workflow:

- Skill entry: `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`
- Node workflow: `wechat-official-account-shareable/wechat-official-account/`

This workflow turns article brief or Markdown into a WeChat Official Account draft. It handles local preview, health checks, AI or local cover strategy, image upload, idempotency state, and official WeChat API draft creation.

Adapter contract:

- Input: platform draft, article brief, Markdown body, cover strategy.
- Preview: call `npm run preview` inside the wrapped workflow.
- Check: call `npm run check`.
- Compose: call `npm run compose` when starting from an article brief.
- Publish: call `npm run publish` only after explicit user action, valid official API credentials, and verified IP whitelist configuration.
- Force publish: call `npm run publish:force` only when duplicate-protection override is explicitly requested.
- Success: inspect `state/published.json` and `output/article-final.html`; API success may not always include `errcode: 0`.

No real publishing should happen from tests or default skeleton commands.
