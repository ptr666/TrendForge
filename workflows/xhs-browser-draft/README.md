# Xiaohongshu Browser Draft Workflow Adapter

This directory is reserved for the wrapped Xiaohongshu browser draft workflow.

Current source workflow notes:

`xhs-browser-draft-setup-package/xhs-browser-draft-setup-package/xhs-browser-draft-setup`

Adapter contract:

- Healthcheck: verify bridge server, browser extension, and login state.
- Fill: call `check-login` then `fill-publish`.
- Save: call `save-draft` only after visible page content is confirmed.

No real browser publishing should happen from tests or default skeleton commands.
