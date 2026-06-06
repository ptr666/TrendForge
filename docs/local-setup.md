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
- `POST /pipeline/run`
- `GET /runs`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /publishers`

Real collection and publishing remain disabled unless explicitly wired through adapters.

## Optional Real Providers

The default pipeline stays deterministic and safe for local tests. Enable real providers only when the local tools and credentials are ready.

### BrowserAct Full Text

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
npm.cmd run cli -- run --run-id browseract-demo --query-file tests/fixtures/rss/ai-workflow.xml
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
npm.cmd run cli -- run --run-id model-demo --query-file tests/fixtures/aihot/aihot-skill.json
```

The provider calls `/chat/completions` and expects JSON content with `title`, `summary`, `angle`, `keyPoints`, and `riskNotes`.
