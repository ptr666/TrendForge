# TrendForge Project Progress

This document defines how TrendForge development is sequenced and tracked. It is the long-lived project progress guide, not a temporary task note.

## Project Goal

Phase 1 focuses on making the local AI trend content pipeline real and observable:

```text
AIHot/RSS source input -> brief verification -> selection -> BrowserAct/MediaCrawler original text acquisition -> summary -> platform draft -> media planning -> publish adapter state -> run history
```

The first phase should deepen a runnable pipeline instead of horizontally filling every package.

## Progress Model

Work is tracked as end-to-end vertical slices. Each slice should produce behavior that can be demonstrated or verified independently.

Allowed status values:

- `planned`: accepted direction, not started.
- `in-progress`: active work exists.
- `blocked`: cannot progress without a missing decision, dependency, credential, external workflow, or environment.
- `done`: implementation, verification, and document sync are complete.

Detailed PRDs and implementation issues live in `.scratch/<feature-slug>/` as described in `docs/agents/issue-tracker.md`.

## Phase 1 Slices

| Order | Slice | Status | Verification signal | Notes |
| --- | --- | --- | --- | --- |
| 1 | AI HOT skill input runs to a review draft | done | CLI and pipeline tests run the committed AIHot fixture through source items, verified articles, selections, summaries, drafts, assets, publish plans, and run events | Proves the highest-priority AI trend path with deterministic providers. |
| 2 | AI HOT RSS and generic RSS/RSSHub fallback run to a review draft | done | End-to-end RSS fixture test proves RSSHub input runs through selection, BrowserAct full-text plan, summaries, review/WeChat/XHS drafts, assets, publish plans, and run history readback | AI HOT RSS live endpoint wiring remains a future source-quality enhancement, not a blocker for the local RSS vertical slice. |
| 3 | Verification failure creates BrowserAct planned command and diagnosable run events | done | Pipeline tests prove selected HTTP source items create `fetch_full_text` BrowserAct planned events with local handoff artifacts, and that BrowserAct-acquired full text feeds summaries and drafts | Keeps difficult pages observable and safe by default; real browser automation is plugged through `FullTextProvider`, and MediaCrawler remains gated behind explicit enablement. |
| 4 | Selection and platform draft generation have stable test surfaces | done | Pipeline tests verify selected articles produce review, WeChat, and XHS drafts, media plans, publish plans, and run events through `createDefaultPipeline` | Stabilizes downstream adapter work. |
| 5 | WeChat draft maps to the `wechat-official-account-workflow` skill contract | done | Dry-run publish results and run events include queued WeChat `plannedCommands` plus a local publisher handoff artifact; explicit real-draft requests fail closed until credential/IP whitelist health gates are ready | Uses `trendforge-adapter-contract`; real draft creation remains gated by explicit approval, credentials, and IP whitelist readiness. |
| 6 | XHS draft maps to the `xhs-browser-draft-setup` skill workflow | done | Dry-run publish results and run events include queued XHS `plannedCommands` plus a local publisher handoff artifact; explicit real-draft requests fail closed until Hermes/bridge/extension/login health gates are ready | Uses `trendforge-adapter-contract`; real draft save remains gated by explicit approval, Hermes/bridge/extension/login health. |
| 7 | CLI/API can query run history, items, and drafts | done | CLI and API acceptance tests run AIHot/RSS pipelines with stable run ids and committed fixtures via `--query-file`, then read back runs, events, items, and drafts through public surfaces | Makes local operation inspectable; `TRENDFORGE_RUNS_DIR` isolates test and experiment history. |
| 8 | Source defaults distinguish collection from original text acquisition | done | Public source configuration exposes `defaultCollectorOrder` for AIHot/RSSHub collection and `defaultFullTextAcquisitionOrder` for BrowserAct/MediaCrawler original-text completion | Prevents BrowserAct and MediaCrawler from being treated as normal subscription sources. |
| 9 | Real BrowserAct and model providers are env-gated | done | Provider tests cover command-backed BrowserAct extraction and OpenAI-compatible chat-completions summaries; pipeline tests prove model summaries flow into drafts | Defaults remain deterministic unless `TRENDFORGE_ENABLE_BROWSERACT=1` or `TRENDFORGE_TEXT_PROVIDER=openai-compatible` is configured. |
| 10 | Browser workbench manages the local pipeline visually | done | `apps/web` builds and exposes model config, WeChat config/token check, subscription management, parameterized pipeline runs, run/event details, original-text artifacts, draft previews, and provider verification surfaces backed by API tests | Real WeChat/XHS publishing remains gated; the WeChat backend can make the official token request from local appId/appSecret config. |

## Per-Slice Definition of Done

A slice is `done` only when:

- The behavior is reachable through a public interface such as CLI, API, pipeline, or run store.
- There is a runnable test, command, or explicit human verification signal.
- Adapter-related work has passed the `trendforge-adapter-contract` checklist.
- Any PRD or implementation issue under `.scratch/<feature-slug>/` reflects the final behavior.
- Stable design changes are reflected in `design/`, `CONTEXT.md`, or `docs/adr/` when appropriate.
- Temporary docs in `docs/working/` are deleted or archived if they are no longer useful.

## Document Sync Loop

Development and documentation move together:

1. Clarify the request with `grill-me` or `grill-with-docs`.
2. Write the PRD and issues under `.scratch/<feature-slug>/`.
3. Implement with `tdd`, one behavior at a time.
4. Update stable docs only when the implementation proves the decision is durable.
5. Run `trendforge-doc-lifecycle` cleanup before marking the slice `done`.

Old working notes do not override current code, tests, design docs, or user instructions. If a document conflicts with implementation reality, resolve the conflict explicitly before continuing.
