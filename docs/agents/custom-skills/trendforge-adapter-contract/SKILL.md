---
name: trendforge-adapter-contract
description: 在新增或修改 TrendForge adapter 契约前使用，覆盖 source、verifier、selector、generator、media、publisher、storage、API、CLI 和外部 workflow integration。任务涉及 AIHot、aihot-skill、AIHot RSS、RSSHub、BrowserAct、MediaCrawler、微信官方 API、wechat-official-account-workflow、XHS、xhs-browser-draft-setup、xiaohongshu-skills、Hermes、pipeline adapters、planned commands、success signals、failure signals、idempotency、compliance gates 或 evidence capture 时使用。
---

# TrendForge Adapter Contract

当任务要把 TrendForge pipeline 接到外部来源、工作流、平台或本地运行面时，先使用本 skill 定义或复核 adapter 契约。

## 先读这些

- `AGENTS.md`
- `docs/agents/domain.md`
- `design/architecture.md`
- `design/integration-map.md`
- `design/source-adapters.md`
- `packages/core/src/types.ts`
- `tests/` 下触达同一 pipeline stage 的现有测试

当前发布工作流事实：

- 微信公众号发布入口是 `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`，它管理本地 Node 工作流：article brief、Markdown、preview、check、AI/本地封面策略、官方 API 图片上传、草稿创建和发布状态。
- 小红书发布入口是 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`，这是围绕 `autoclaw-cc/xiaohongshu-skills`、Hermes、browser bridge、Chrome extension、login checks、page fill、draft save 和可选 publish commands 的 share-safe setup/troubleshooting skill。

当前来源工作流事实：

- AI 热点信息优先进入 AIHot：`https://aihot.virxact.com/aihot-skill/`。
- AIHot RSS 是同源 fallback，优先级高于通用 RSSHub route。
- RSSHub 保持为非 AIHot source 的通用 RSS/RSSHub adapter。

## 契约清单

编码前，在任务记录、PRD、issue 或 working doc 中写清：

- Adapter role：source、verifier、selector、generator、media、publisher、storage、API、CLI 或 workflow bridge。
- Input contract：必填字段、可选字段、接受格式和拒绝格式。
- Output contract：标准化对象形状和阶段专属状态值。
- Success signal：能证明 adapter 成功的可观察结果。
- Failure signal：能证明 adapter 失败的可观察结果。
- Idempotency key：重复运行如何避免重复采集、草稿、资产或发布。
- Evidence：为后续诊断保留哪些 URL、artifact、event 或 raw result。
- Compliance gate：是否需要显式用户启用、登录态、速率限制或平台规则检查。
- Dry-run behavior：真实发布或真实采集禁用时发生什么。
- Test surface：能验证该行为的最高 public interface。

## 实现规则

- 测试完整 pipeline 行为时，优先通过 `createDefaultPipeline` 写垂直行为测试。
- 外部工作流命令默认保持为 planned command，除非用户显式启用真实执行。
- 保持现有默认安全边界：MediaCrawler 不显式启用就保持禁用。
- 对后续检查有意义的状态必须通过 `RunStore` event 保存为 run-visible state。
- 影响 fallback order、status transition、idempotency 或 dry-run 行为时，补充回归测试。
- 不要把平台专属假设写进 `packages/core`，除非它已经成为共享领域契约。

## 结束前

- 运行最窄但有用的测试命令。
- 确认 adapter 的成功和失败信号已在测试中体现，或明确记录为什么暂时不可测试。
- 如果变更形成难以回退的设计决策，通过 `grill-with-docs` 提议 ADR。
