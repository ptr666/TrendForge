---
name: trendforge-adapter-contract
description: Define or review TrendForge adapter contracts before adding or changing source, verifier, selector, generator, media, publisher, storage, API, CLI, or external workflow integrations. Use when a task touches AI HOT, aihot-skill, AI HOT RSS, RSSHub, BrowserAct, MediaCrawler, WeChat official API, wechat-official-account-workflow, XHS, xhs-browser-draft-setup, xiaohongshu-skills, Hermes, pipeline adapters, planned commands, success signals, failure signals, idempotency, compliance gates, or evidence capture.
---

# TrendForge Adapter Contract

Use this skill before implementing or changing an adapter that connects TrendForge's pipeline to an external source, workflow, platform, or local runtime surface.

## Read First

- `AGENTS.md`
- `docs/agents/domain.md`
- `design/architecture.md`
- `design/integration-map.md`
- `design/source-adapters.md`
- `packages/core/src/types.ts`
- Existing tests under `tests/` that touch the same pipeline stage

Current publishing workflow facts:

- WeChat publishing enters through `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`, which manages the local Node workflow for article brief, Markdown, preview, check, AI/local cover strategy, official API image upload, draft creation, and publish state.
- Xiaohongshu publishing enters through `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`, a share-safe setup and troubleshooting skill around `autoclaw-cc/xiaohongshu-skills`, Hermes, browser bridge, Chrome extension, login checks, page fill, draft save, and optional publish commands.

Current source workflow facts:

- AI trend information enters first through AI HOT: `https://aihot.virxact.com/aihot-skill/`.
- AI HOT RSS is the same-source fallback and stays ahead of generic RSSHub routes.
- RSSHub remains the general RSS/RSSHub adapter for non-AI HOT sources.

## Contract Checklist

Before coding, write down the contract in the task notes, PRD, issue, or working doc:

- Adapter role: source, verifier, selector, generator, media, publisher, storage, API, CLI, or workflow bridge
- Input contract: required fields, optional fields, accepted formats, and rejected formats
- Output contract: normalized object shape and stage-specific status values
- Success signal: the observable result that proves the adapter worked
- Failure signal: the observable result that proves it did not work
- Idempotency key: how repeated runs avoid duplicate capture, drafts, assets, or publishes
- Evidence: what URL, artifact, event, or raw result should be retained for later diagnosis
- Compliance gate: whether explicit user enablement, login state, rate limits, or platform rules apply
- Dry-run behavior: what happens when real publishing or real crawling is disabled
- Test surface: the highest public interface that can verify the behavior

## Implementation Rules

- Prefer vertical behavior through `createDefaultPipeline` when testing full pipeline behavior.
- Keep external workflow commands as planned commands unless the user explicitly enables real execution.
- Preserve existing default safety: MediaCrawler remains disabled unless explicitly enabled.
- Store run-visible state through `RunStore` events when the behavior matters for later inspection.
- Add regression tests for fallback order, status transitions, idempotency, and dry-run behavior when those are affected.
- Do not encode platform-specific assumptions into `packages/core` unless they are part of the shared domain contract.

## Before Finishing

- Run the narrowest useful test command.
- Confirm the adapter's success and failure signals are represented in tests or documented as not yet testable.
- If the change creates a hard-to-reverse design decision, propose an ADR through `grill-with-docs`.
