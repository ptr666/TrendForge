# TrendForge Web Workbench

Browser-based local cockpit for the TrendForge pipeline.

Current capabilities:

- Configure OpenAI-compatible model settings from the browser. Secrets are stored in local ignored workspace config and API responses only expose masked previews.
- Configure WeChat official account `appId`, `appSecret`, and `coverMediaId`, then trigger a backend token request for health verification.
- Inspect WeChat publisher gate state from `/publishers`; real draft creation requires explicit `allowRealDraft=true`, valid token/IP whitelist readiness, and cover media readiness.
- Configure the XHS browser workflow directory and bridge URL, then inspect the real browser draft gate.
- Manage AIHot/RSS/RSSHub subscriptions and validate sources.
- Inspect source health by subscription, including status, error category, item count, checked time, and sample links.
- Run the AIHot/RSS pipeline with selectable source mode, platform targets, `topN`, BrowserAct, and MediaCrawler fallback flags.
- Inspect run history, stage events, selected items, verified original text status, summaries, drafts, and publish handoff results.
- Inspect a review/waiting queue that turns missing original text, generated summaries, platform drafts, and publisher handoffs into explicit human control points.
- Review and approve planned image assets before real platform draft creation.
- Read saved original-text and draft artifacts through the API-safe artifact reader.
- Keep the workbench maintainable through shared Web types, an API client, UI primitives, and focused panel components.

The workbench still keeps formal publishing disabled. WeChat and XHS real draft creation are both gated by explicit real-draft requests and health checks; XHS success requires the page-level draft-saved signal, not just a command exit code.
