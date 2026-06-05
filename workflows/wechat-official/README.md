# WeChat Official Workflow Adapter

This directory is reserved for the wrapped WeChat Official Account workflow.

Current source workflow:

`wechat-official-account-shareable/wechat-official-account-shareable/wechat-official-account`

Adapter contract:

- Input: platform draft, article brief, Markdown body, cover strategy.
- Preview: call `npm run preview` inside the wrapped workflow.
- Check: call `npm run check`.
- Publish: call `npm run publish` only after explicit user action.

No real publishing should happen from tests or default skeleton commands.
