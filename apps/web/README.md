# TrendForge Web Workbench

Browser-based local cockpit for the TrendForge pipeline.

Current capabilities:

- Configure OpenAI-compatible model settings from the browser. Secrets are stored in local ignored workspace config and API responses only expose masked previews.
- Configure WeChat official account `appId` and `appSecret`, then trigger a backend token request for health verification.
- Manage AIHot/RSS/RSSHub subscriptions and validate sources.
- Run the AIHot/RSS pipeline with selectable source mode, platform targets, `topN`, BrowserAct, and MediaCrawler fallback flags.
- Inspect run history, stage events, selected items, verified original text status, summaries, drafts, and publish handoff results.
- Read saved original-text and draft artifacts through the API-safe artifact reader.

The workbench still keeps real platform publishing gated. WeChat and XHS draft creation remain planned/handoff flows unless explicit real-draft support and health gates are added.
