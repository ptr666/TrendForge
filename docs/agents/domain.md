# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

TrendForge currently uses a single-context layout.

Read these before making domain-sensitive changes:

- `CONTEXT.md` at the repo root, if it exists
- `docs/adr/`, if it exists and contains decisions relevant to the area being changed
- `design/architecture.md` for the current pipeline model
- `design/integration-map.md` for source, publisher, and external workflow mapping
- `design/source-adapters.md` when changing RSSHub, BrowserAct, or MediaCrawler behavior
- `design/trendforge-contracts.schema.json` when changing pipeline contracts
- `docs/agents/custom-skills/` for TrendForge-specific adapter and documentation lifecycle workflows

If `CONTEXT.md` or `docs/adr/` does not exist yet, proceed silently. Producer skills such as `grill-with-docs` should create them lazily when terms or decisions actually become stable.

## Vocabulary discipline

When output names a domain concept, use TrendForge's existing language:

- Source item
- Verified article
- Candidate selection
- Platform draft
- Media asset
- Publisher adapter
- Run store
- Pipeline run

If the concept needed for a task is not in the glossary yet, either avoid inventing new vocabulary or use `grill-with-docs` to resolve the term before writing long-lived docs.

## ADR conflicts

If output contradicts an existing ADR, surface it explicitly instead of silently overriding it.

## Working docs lifecycle

Temporary planning documents should live under `docs/working/` or `.scratch/<feature-slug>/`. After a task finishes, delete or archive temporary working docs unless they became stable project knowledge.
