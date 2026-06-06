# TrendForge Usage Flow

This document describes the current end-to-end local operating flow for TrendForge.

TrendForge is a local-first AI trend content production desk. The default safe path creates local drafts, assets, review queue items, and platform handoff plans. Formal publishing stays disabled.

## 1. Install And Validate

Install dependencies:

```powershell
npm.cmd install --cache .\.npm-cache
```

Build and test:

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Optional isolated run history:

```powershell
$env:TRENDFORGE_RUNS_DIR = "G:\TrendForge\workspace\runs-dev"
```

## 2. Start The Local Backend And Workbench

Terminal 1:

```powershell
npm.cmd run api
```

Terminal 2:

```powershell
npm.cmd run web:dev
```

Open the Vite URL shown in the terminal. The workbench talks to the API at `http://127.0.0.1:4780` by default.

If needed:

```powershell
$env:VITE_TRENDFORGE_API = "http://127.0.0.1:4780"
```

## 3. Configure Providers

### Model Provider

In the Web workbench, configure:

- Provider: `openai-compatible`
- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-flash`
- API key: local only, never committed

Equivalent environment variables:

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

Use `POST /verify/model` or the Web "Test model request" button to verify the model path.

### BrowserAct Original Text

BrowserAct is the preferred original-text acquisition path after an item is selected.

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
```

Use `POST /verify/browseract` or the Web "Run BrowserAct URL" button to verify a URL.

When BrowserAct is not enabled, selected HTTP items still produce planned commands and handoff artifacts for diagnosis.

### MediaCrawler Fallback

MediaCrawler is disabled by default. Only enable it explicitly after compliance review.

Use `POST /verify/mediacrawler` or the Web "Check MediaCrawler" button to inspect local availability.

## 4. Configure Sources

The collection priority is:

```text
AIHot skill -> AIHot RSS -> RSS/RSSHub
```

BrowserAct and MediaCrawler are not normal subscription sources. They are original-text acquisition paths used after selection.

In the Web workbench:

1. Open Sources.
2. Add or edit an `aihot`, `rss`, or `rsshub` subscription.
3. Click "Verify source".
4. Inspect source health: status, error category, item count, checked time, and sample links.
5. Click "Use in run" to run a subscription source.

CLI source inspection:

```powershell
npm.cmd run cli -- sources
```

Run committed fixtures:

```powershell
npm.cmd run cli -- run --run-id aihot-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id rss-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
```

## 5. Run The Pipeline

Default pipeline:

```text
AIHot/RSS input
-> brief verification
-> selection
-> BrowserAct/MediaCrawler original text acquisition
-> Chinese summary
-> review/wechat/xhs drafts
-> asset planning
-> publisher handoff/gate
-> run history and review queue
```

CLI:

```powershell
npm.cmd run cli -- run --run-id local-run --query-file tests/fixtures/aihot/aihot-skill.json --platforms review,wechat,xhs --top-n 1
```

API:

```http
POST /pipeline/run
```

Typical body:

```json
{
  "runId": "local-run",
  "requestedPlatforms": ["review", "wechat", "xhs"],
  "topN": 1,
  "allowBrowserFallback": true,
  "allowMediaCrawlerFallback": false,
  "allowRealDraft": false
}
```

Web:

1. Choose source mode: AIHot latest, subscription, or custom query/source.
2. Select platforms: review, wechat, xhs.
3. Set `topN`.
4. Decide whether BrowserAct and MediaCrawler fallback are allowed.
5. Click "Run pipeline".

## 6. Inspect Runs And Artifacts

CLI:

```powershell
npm.cmd run cli -- runs
npm.cmd run cli -- events --run-id local-run
```

API:

- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /items`
- `GET /drafts`
- `GET /artifacts?path=<workspace/runs/...>`

Generated artifacts are saved under `workspace/runs/<runId>/`:

- `drafts/`: review, WeChat, and XHS Markdown drafts
- `full-text/`: saved original text Markdown
- `full-text-handoffs/`: BrowserAct planned extraction handoffs
- `publisher-handoffs/`: WeChat and XHS platform handoff JSON

The Web Reader panel can open saved original-text and draft artifacts through the API-safe artifact reader.

## 7. Review Queue And Asset Approval

Every run creates explicit human control points:

- `original-text`: missing or failed original text
- `summary`: Chinese summary review
- `draft`: platform draft review
- `asset`: image asset approval
- `publisher`: WeChat/XHS handoff or gate state
- `pipeline`: run-level errors

Assets currently default to planned prompt assets:

- WeChat cover: `16:9`
- XHS image: `3:4`

Approve an asset in the Web Review panel, or call:

```http
POST /runs/:runId/assets/:assetId/approve
```

Approval updates the saved run, marks the asset `approved`, clears `approvalRequired`, rebuilds the review queue, and appends an `asset_approval` event.

## 8. WeChat Draft Gate

WeChat uses the `wechat-official-account-workflow` contract and the official WeChat API draft path.

Configure in Web:

- `appId`
- `appSecret`
- `coverMediaId`

Health and token checks:

- `GET /config/wechat`
- `PUT /config/wechat`
- `POST /verify/wechat`
- `GET /publishers`

Real draft creation requires:

- `allowRealDraft=true`
- enabled WeChat config
- valid `appId` and `appSecret`
- IP whitelist/token readiness
- `coverMediaId`

Formal publishing remains disabled. The supported real platform side effect is draft creation only.

## 9. XHS Browser Draft Gate

XHS uses `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`, backed by `autoclaw-cc/xiaohongshu-skills`, Hermes, a bridge server, Chrome extension, login state, and page-level verification.

Configure in Web:

- XHS workflow directory, default `vendor/xiaohongshu-skills`
- Bridge URL, default `ws://localhost:9343`

Health checks:

- `GET /config/xhs`
- `PUT /config/xhs`
- `POST /verify/xhs`
- `GET /publishers`

Real save requires:

```text
check-login -> fill-publish -> save-draft -> page-level draft-saved signal
```

Do not treat command exit code alone as success. The browser page must show a draft-saved signal.

## 10. Safe Defaults

- Default runs are dry-run publisher handoffs.
- Real platform drafts require explicit `allowRealDraft=true`.
- Formal publish is disabled.
- Secrets stay in environment variables or ignored local config under `workspace/config/`.
- `workspace/` is runtime state, not source code.
- MediaCrawler requires explicit enablement and compliance review.

## 11. Verification Checklist

Before handing off a change or using a run for production review:

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Recommended backend smoke:

```powershell
$env:TRENDFORGE_RUNS_DIR = Join-Path $env:TEMP ("trendforge-smoke-" + [guid]::NewGuid().ToString("N"))
npm.cmd run cli -- run --run-id smoke-aihot --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id smoke-rss --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
npm.cmd run cli -- events --run-id smoke-rss
```
