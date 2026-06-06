---
name: trendforge-doc-lifecycle
description: Manage TrendForge working docs, PRDs, issues, ADRs, CONTEXT.md, and agent docs so temporary planning notes do not become stale project constraints. Use when creating, updating, archiving, deleting, or relying on docs under docs/working, docs/adr, .scratch, docs/agents, CONTEXT.md, design, or README files.
---

# TrendForge Doc Lifecycle

Use this skill whenever a task creates or relies on documentation that could influence future implementation.

## Document Classes

- `CONTEXT.md`: stable glossary only. No implementation plans, no specs, no temporary decisions.
- `docs/adr/`: stable architectural decisions only. Create ADRs sparingly for decisions that are hard to reverse, surprising without context, and based on real tradeoffs.
- `design/`: stable system design and contracts.
- `docs/agents/`: agent operating rules and skill configuration.
- `docs/working/`: temporary planning notes for the current task.
- `.scratch/<feature-slug>/`: local PRDs, issues, and task discussion.

## Rules

- Put temporary consensus in `docs/working/` or `.scratch/<feature-slug>/`, not `design/`.
- Promote a working note to `design/`, `CONTEXT.md`, or `docs/adr/` only when it is stable project knowledge.
- Delete or archive temporary working docs after the task completes.
- Do not let old working docs override current code, tests, design docs, or user instructions.
- When a doc conflicts with code, surface the conflict and resolve it before implementation.
- When a doc conflicts with a later user requirement, treat the later requirement as a reason to revisit the doc, not as a silent override.

## End-of-Task Cleanup

Before finishing a task that created or changed docs:

- Identify every doc touched.
- Mark each as stable, temporary, or obsolete.
- Delete obsolete temporary docs when safe.
- Move still-useful temporary docs into `.scratch/<feature-slug>/` if they are only task history.
- Keep `docs/README.md` updated when adding stable documentation areas.

## Pair With Other Skills

- Use with `grill-with-docs` when resolving terminology or durable decisions.
- Use with `to-prd` and `to-issues` when local markdown issue files are created.
- Use with `diagnose` when debug notes, traces, or temporary hypotheses are written down.
