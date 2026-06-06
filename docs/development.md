# TrendForge Development

This document defines the default development workflow for TrendForge. It is a long-lived process guide for human developers and agents.

## Development Principles

Follow the repository rules in `AGENTS.md`:

- Keep changes simple and scoped to the current request.
- Prefer surgical edits over broad refactors.
- Define success criteria before implementation.
- Verify the behavior that changed.
- Record durable decisions, but do not preserve temporary planning notes as permanent constraints.

## Skill Workflow

Use the installed skills and repository-local skill drafts as the default path from idea to implementation:

```text
grill-me or grill-with-docs
-> to-prd
-> to-issues
-> tdd
-> trendforge-doc-lifecycle cleanup
```

- Use `grill-me` when the request is broad and needs interrogation before documentation.
- Use `grill-with-docs` when terminology, domain language, or durable decisions need to be captured.
- Use `to-prd` after intent is clear enough to describe the user-facing problem and solution.
- Use `to-issues` to break a PRD into end-to-end vertical slices in the local markdown issue tracker.
- Use `tdd` to implement one observable behavior at a time.
- Use `diagnose` when a bug, regression, or inconsistent pipeline result needs a feedback loop and root cause.
- Use `improve-codebase-architecture` when tests are hard to write or module boundaries are blocking progress.

The local issue tracker convention is documented in `docs/agents/issue-tracker.md`. Domain documentation rules are documented in `docs/agents/domain.md`.

## Adapter Work

Before adding or changing an adapter, planned command, publisher, source integration, workflow bridge, success signal, failure signal, idempotency rule, compliance gate, or evidence capture behavior, use `trendforge-adapter-contract`.

Current publishing workflow facts:

- WeChat publishing enters through `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`, which manages the local Node workflow for article brief, Markdown, preview, check, AI/local cover strategy, official API image upload, draft creation, and publish state.
- Xiaohongshu publishing enters through `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`, a share-safe setup and troubleshooting skill around `autoclaw-cc/xiaohongshu-skills`, Hermes, browser bridge, Chrome extension, login checks, page fill, draft save, and optional publish commands.
- Publish results and run events should expose structured `plannedCommands` for dry-run draft creation, while real draft creation remains behind explicit approval and health gates.
- `--real-draft` or `allowRealDraft=true` requests real draft creation, but publisher adapters must still fail closed when workflow health gates are not ready.

Current source workflow facts:

- AI trend information enters first through AI HOT: `https://aihot.virxact.com/aihot-skill/`.
- AI HOT RSS is the same-source fallback and stays ahead of generic RSSHub routes.
- RSSHub remains the general RSS/RSSHub adapter for non-AI HOT sources.
- RSS and AI HOT source items may contain brief text, but original-text acquisition belongs to BrowserAct or MediaCrawler after selection.
- BrowserAct is the default planned command path for selected HTTP source items that still need original text.
- `FullTextProvider` is the pipeline seam for plugging in real BrowserAct or MediaCrawler extraction; tests should prove acquired full text feeds summaries and drafts.
- MediaCrawler is never a default original-text acquisition path; it requires explicit enablement and compliance review.

The skill draft lives at `docs/agents/custom-skills/trendforge-adapter-contract/SKILL.md`.

The contract must clarify:

- Adapter role and pipeline stage.
- Input and output contract.
- Observable success and failure signals.
- Idempotency key.
- Evidence retained for diagnosis.
- Compliance or explicit-enable requirements.
- Dry-run behavior.
- Highest public interface for tests.

Keep external workflow commands as planned commands unless the user explicitly enables real execution. MediaCrawler remains disabled unless explicitly enabled.

## TDD Standard

Implementation tasks should start with behavior tests through public interfaces. Prefer the highest stable interface that exercises the real path:

- CLI behavior for local user workflows.
- API behavior for HTTP-facing workflows.
- `createDefaultPipeline` for end-to-end pipeline behavior.
- `RunStore` behavior for persisted run state and event history.

Write one failing test for one behavior, implement the minimum code to pass it, then repeat. Do not bulk-write tests for imagined future behavior.

## Documentation Sync

Every implementation task ends with a document sync check:

- Update `design/` only for stable system design or contract changes.
- Update `docs/agents/` only for agent operating rules and skill configuration.
- Update `.scratch/<feature-slug>/` for PRDs, implementation issues, and task discussion.
- Use `docs/working/` only for temporary planning notes.
- Update `CONTEXT.md` only for stable glossary terms.
- Add `docs/adr/` entries only for durable decisions that are hard to reverse, surprising without context, and based on real tradeoffs.

Use `trendforge-doc-lifecycle` for this cleanup. The skill draft lives at `docs/agents/custom-skills/trendforge-doc-lifecycle/SKILL.md`.

Temporary working docs should be deleted or archived when they no longer guide active work.

## Verification Commands

Default verification commands:

```powershell
npm.cmd run build
npm.cmd test
```

For pure documentation changes, business tests are not required. Verify links, references, and consistency with `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and the relevant custom skill drafts.

## Backend Commands

The backend-first workflow is available through API and CLI surfaces:

- `trendforge run` runs the full local pipeline.
- `trendforge run --run-id <id>` runs the pipeline with a stable id for reproducible run history checks.
- `trendforge run --run-id <id> --query-file tests/fixtures/aihot/aihot-skill.json` runs the committed AIHot fixture through the local end-to-end pipeline.
- `trendforge run --run-id <id> --query-file tests/fixtures/rss/ai-workflow.xml` runs the committed RSS fixture through the local end-to-end pipeline.
- `trendforge run-subscription --subscription-id <id>` runs an enabled local source subscription.
- `trendforge runs` lists saved pipeline runs.
- `trendforge events --run-id <id>` reads stage events for a run.
- `trendforge sources` prints source adapter defaults, original-text acquisition defaults, AI HOT priority, and local subscriptions.
- `trendforge publishers` prints publisher adapter health.

The API exposes matching run inspection surfaces:

- `POST /pipeline/run`
- `POST /pipeline/run` accepts an optional `runId` for reproducible run history checks.
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /publishers`

`defaultCollectorOrder` describes brief-information collection only: AI HOT first, then generic RSS/RSSHub. `defaultFullTextAcquisitionOrder` describes original-text completion after selection: BrowserAct first, then MediaCrawler only when explicitly enabled.

Set `TRENDFORGE_RUNS_DIR=<path>` to isolate run history during tests, experiments, or scripted verification.
