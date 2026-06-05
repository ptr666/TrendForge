# Maintenance Runbook

## Routine Checks

Run these before changing adapters or publishing behavior:

```powershell
npm.cmd run check
npm.cmd run build
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

## Release Checklist

- TypeScript check passes.
- Build passes.
- Tests pass.
- No runtime files are staged.
- Vendor submodules point to reviewed commits.
- README and docs reflect any new adapter behavior.

## Failure Handling

- Pipeline failures must write a run event.
- Failed collection should not block unrelated source items.
- Failed publishing must not modify source items or other platform drafts.
- Real external side effects must stay behind explicit flags or UI confirmation.

