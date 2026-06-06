# TrendForge

TrendForge is a local-first AI trend content production desk. It turns AIHot/RSS signals into reviewable Chinese summaries, platform drafts, planned image assets, publisher handoffs, and controlled WeChat/XHS draft gates.

The current end-to-end flow is:

```text
AIHot/RSS input
-> brief verification
-> hotspot selection
-> BrowserAct/MediaCrawler original text acquisition
-> Chinese summary
-> Review/WeChat/XHS drafts
-> image asset planning and approval
-> WeChat/XHS draft gates
-> run history, events, artifacts, and review queue
```

Formal publishing is disabled. Real platform draft creation is guarded by explicit real-draft requests and health gates.

## Current Capabilities

- API backend for running and inspecting the local pipeline.
- CLI for fixture runs, local pipeline runs, run history, events, sources, and publishers.
- Web workbench for model settings, source management, pipeline runs, run history, artifact reading, review queue, asset approval, and publisher gate status.
- AIHot-first source strategy, with AIHot RSS/RSSHub as fallback subscription paths.
- BrowserAct planned or command-backed original-text acquisition after selection.
- MediaCrawler fallback support only when explicitly enabled and reviewed for compliance.
- Deterministic local text provider by default, with OpenAI-compatible model support.
- WeChat official account draft gate using appId/appSecret, token check, `coverMediaId`, and official draft API wrapper.
- XHS browser draft gate using the `xhs-browser-draft-setup` workflow, Hermes/bridge/Chrome extension/login checks, and page-level draft-saved signal.
- Planned image assets with WeChat `16:9` cover and XHS `3:4` image defaults.

## Quick Start

```powershell
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Start the local API:

```powershell
npm.cmd run api
```

Start the Web workbench in another terminal:

```powershell
npm.cmd run web:dev
```

Run fixture pipelines:

```powershell
npm.cmd run cli -- run --run-id aihot-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id rss-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
npm.cmd run cli -- events --run-id rss-demo
```

## Local Configuration

Runtime configuration and run artifacts are written under `workspace/`, which is ignored by Git.

Model settings can be configured through the Web workbench or environment variables:

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

Do not commit API keys, app secrets, cookies, tokens, browser profiles, or local account screenshots.

## Important API Surfaces

- `POST /pipeline/run`
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `POST /runs/:runId/assets/:assetId/approve`
- `GET /sources`
- `GET /sources/health`
- `GET /publishers`
- `GET /config/model`, `PUT /config/model`
- `GET /config/wechat`, `PUT /config/wechat`, `POST /verify/wechat`
- `GET /config/xhs`, `PUT /config/xhs`, `POST /verify/xhs`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `GET /artifacts?path=<workspace/runs/...>`

## Project Structure

- `apps/api`: local HTTP API.
- `apps/cli`: local CLI entrypoint.
- `apps/web`: browser workbench.
- `packages/core`: pipeline orchestration and domain types.
- `packages/config`: source defaults, subscriptions, local model/WeChat/XHS config.
- `packages/sources`: AIHot, RSS/RSSHub, BrowserAct, and MediaCrawler source adapters.
- `packages/verifier`: source-item verification.
- `packages/selector`: scoring and Top N selection.
- `packages/providers`: BrowserAct provider, deterministic text provider, OpenAI-compatible text/selector providers.
- `packages/generator`: Review/WeChat/XHS draft generation.
- `packages/media`: image asset planning.
- `packages/publishers`: WeChat/XHS handoff and real-draft gates.
- `packages/storage`: local run history and event storage.
- `docs`: long-lived operating and development docs.
- `workspace`: ignored local runtime data.

## Documentation

- [Docs index](docs/README.md)
- [Complete usage flow](docs/usage-flow.md)
- [Local setup](docs/local-setup.md)
- [Development workflow](docs/development.md)
- [Project progress](docs/project-progress.md)
- [Vendor projects and open-source references](docs/vendor-projects.md)
- [Git workflow](docs/git-workflow.md)
- [Maintenance runbook](docs/maintenance-runbook.md)

## Open-Source References

TrendForge references or integrates with these projects through adapters, local skills, or planned command handoffs:

- [RSSHub](https://github.com/DIYgod/RSSHub)
- [BrowserAct skills](https://github.com/browser-act/skills)
- [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)
- [autoclaw-cc/xiaohongshu-skills](https://github.com/autoclaw-cc/xiaohongshu-skills)
- [AIHot skill](https://aihot.virxact.com/aihot-skill/)
- `xhs-browser-draft-setup-package/`
- `wechat-official-account-shareable/`

See [docs/vendor-projects.md](docs/vendor-projects.md) for the maintained reference list and local behavior rules.
