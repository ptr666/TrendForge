# Local Setup

## Requirements

- Node.js 20 or newer
- npm
- Git

## Install

Use a project-local npm cache on this machine because the global npm cache may point outside the workspace:

```powershell
npm.cmd install --cache .\.npm-cache
```

## Validate

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
```

## Run CLI

```powershell
npm.cmd run cli -- run --query "AI workflow demo" --platforms review,wechat,xhs
```

The command writes run records into `workspace/runs/`.

## Run API

```powershell
npm.cmd run api
```

Then use:

- `GET /health`
- `GET /providers`
- `GET /subscriptions`
- `PUT /subscriptions`
- `POST /subscriptions/validate`
- `POST /verify/rss`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `POST /verify/model`
- `POST /pipeline/run`
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /publishers`

Real collection and publishing remain disabled unless explicitly wired through adapters.

## Run Web UI

Start the API first, then start the local Vite workbench:

```powershell
npm.cmd run api
npm.cmd run web:dev
```

The UI defaults to `http://127.0.0.1:4780` for API calls. Override it with:

```powershell
$env:VITE_TRENDFORGE_API = "http://127.0.0.1:4780"
```

The workbench includes:

- RSS subscription management and validation.
- BrowserAct original-text verification.
- MediaCrawler configuration checks.
- OpenAI-compatible model verification.
- Pipeline run history, drafts, assets, and handoff artifact paths.

## Optional Real Providers

The default pipeline stays deterministic and safe for local tests. Enable real providers only when the local tools and credentials are ready.

### BrowserAct Full Text

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
npm.cmd run cli -- run --run-id browseract-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
```

When enabled, selected HTTP source items run:

```text
browser-act stealth-extract <url> --content-type markdown
```

Success means `VerifiedArticle.fullText` is populated and the `fetch_full_text` event becomes `verified`. Failure is recorded as a failed BrowserAct article with the command error message.

### OpenAI-Compatible Text Provider

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.openai.com/v1"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "gpt-4.1-mini"
npm.cmd run cli -- run --run-id model-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
```

The provider calls `/chat/completions` and expects JSON content with `title`, `summary`, `angle`, `keyPoints`, and `riskNotes`.

### Real End-to-End Smoke Run

Use process-local environment variables for credentials. Do not write API keys into repository files.

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
npm.cmd run cli -- run --run-id real-e2e-smoke --query "https://openai.com/news/rss.xml" --platforms review,wechat,xhs --top-n 1
```

The run stores review, WeChat, and XHS draft Markdown files under `workspace/runs/<run-id>/drafts/`. BrowserAct original-text evidence is recorded in `workspace/runs/<run-id>.events.jsonl`.
