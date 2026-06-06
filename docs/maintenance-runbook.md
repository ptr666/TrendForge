# Maintenance Runbook

## Routine Checks

Run these before changing adapters or publishing behavior:

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Then inspect:

```powershell
git status --short
git submodule status
```

## Adapter Safety

- RSSHub may fetch public RSS feeds.
- BrowserAct should plan browser actions before executing them.
- MediaCrawler is disabled by default and requires compliance review.
- Publishing remains dry-run unless explicitly enabled by user action.
- WeChat real draft creation requires `allowRealDraft=true`, valid credentials, IP whitelist/token readiness, and `coverMediaId`.
- XHS real browser draft save requires `allowRealDraft=true`, configured `xiaohongshu-skills`, bridge/extension/login readiness, and a page-level draft-saved signal.
- Asset approval is stored on the saved run and should remove only the approved asset from the review queue.

## Release Checklist

- TypeScript check passes.
- Build passes.
- Tests pass.
- Web build passes.
- No runtime files are staged.
- Vendor submodules point to reviewed commits.
- README and docs reflect any new adapter behavior.

## Failure Handling

- Pipeline failures must write a run event.
- Failed collection should not block unrelated source items.
- Failed publishing must not modify source items or other platform drafts.
- Real external side effects must stay behind explicit flags or UI confirmation.
- Do not treat command exit code alone as XHS success; require page-level evidence.
- If review queue state looks wrong, inspect the saved run asset statuses and rebuild through the public API path before editing stored JSON manually.
