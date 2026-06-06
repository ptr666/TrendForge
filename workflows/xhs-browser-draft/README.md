# Xiaohongshu Browser Draft Workflow Adapter

This directory is reserved for the wrapped Xiaohongshu browser draft workflow.

Current source workflow:

- Local skill package: `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`
- Implementation provenance: `https://github.com/autoclaw-cc/xiaohongshu-skills`
- Runtime bridge: Hermes + browser bridge + Chrome extension
- Role: share-safe setup and troubleshooting until `check-login`, `fill-publish`, and `save-draft` can reliably save a Xiaohongshu draft

Adapter contract:

- Healthcheck: verify Hermes, bridge server, browser extension, and login state.
- Fill: call `check-login` then `fill-publish`.
- Save: call `save-draft` only after visible page content is confirmed.
- Publish: call `publish` only after explicit user action.
- Success: browser page shows an explicit draft-saved signal; command success alone is not enough.
- Environment: preserve both macOS + Chrome and WSL + Windows Chrome setup guidance.

No real browser publishing should happen from tests or default skeleton commands.
