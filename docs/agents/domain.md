# 领域文档

本文说明工程类技能在探索代码库时，应如何读取本仓库的领域文档。

## 布局

TrendForge 当前使用单一上下文文档布局。

做领域敏感改动前，优先阅读：

- 仓库根目录的 `CONTEXT.md`，如果存在。
- `docs/adr/`，如果存在且包含相关决策。
- `design/architecture.md`，了解当前 pipeline 模型。
- `design/integration-map.md`，了解 source、publisher 和外部工作流映射。
- `design/source-adapters.md`，当改动 RSSHub、BrowserAct 或 MediaCrawler 行为时阅读。
- `design/trendforge-contracts.schema.json`，当改动 pipeline 契约时阅读。
- `docs/agents/custom-skills/`，了解 TrendForge 专属 adapter 和文档生命周期工作流。

如果 `CONTEXT.md` 或 `docs/adr/` 尚不存在，可以继续工作。`grill-with-docs` 这类生产文档的技能应只在术语或决策真正稳定时再懒创建它们。

## 术语纪律

输出中提到领域概念时，优先使用 TrendForge 现有语言：

- Source item
- Verified article
- Candidate selection
- Platform draft
- Media asset
- Publisher adapter
- Run store
- Pipeline run

如果任务需要的新概念还没有进入 glossary，要么避免发明新术语，要么先用 `grill-with-docs` 明确术语，再写入长期文档。

## ADR 冲突

如果输出会与已有 ADR 冲突，必须显式指出，不要静默覆盖。

## Working docs 生命周期

临时计划文档应放在 `docs/working/` 或 `.scratch/<feature-slug>/`。任务结束后，除非它们已经变成稳定项目知识，否则应删除或归档。
