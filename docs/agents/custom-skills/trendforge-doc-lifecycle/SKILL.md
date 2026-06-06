---
name: trendforge-doc-lifecycle
description: 管理 TrendForge working docs、PRDs、issues、ADRs、CONTEXT.md 和 agent docs，避免临时计划沉淀成过期项目约束。当创建、更新、归档、删除或依赖 docs/working、docs/adr、.scratch、docs/agents、CONTEXT.md、design 或 README 文件时使用。
---

# TrendForge Doc Lifecycle

当任务创建或依赖会影响未来实现的文档时，使用本 skill。

## 文档类别

- `CONTEXT.md`：只放稳定 glossary。不放实现计划、spec 或临时决策。
- `docs/adr/`：只放稳定架构决策。只有难以回退、没有上下文会令人疑惑、并且确实存在取舍的决策才创建 ADR。
- `design/`：稳定系统设计和契约。
- `docs/agents/`：agent 操作规则和 skill 配置。
- `docs/working/`：当前任务的临时计划记录。
- `.scratch/<feature-slug>/`：本地 PRDs、issues 和任务讨论。

## 规则

- 临时共识放在 `docs/working/` 或 `.scratch/<feature-slug>/`，不要放进 `design/`。
- 只有稳定项目知识才能从 working note 提升到 `design/`、`CONTEXT.md` 或 `docs/adr/`。
- 任务完成后删除或归档临时 working docs。
- 旧 working docs 不得覆盖当前代码、测试、设计文档或用户指令。
- 文档与代码冲突时，先指出冲突并解决，再实现。
- 文档与后续用户需求冲突时，把后续需求视为重新审视文档的理由，不要静默覆盖。

## 任务结束清理

完成创建或修改文档的任务前：

- 列出所有触达的文档。
- 标记每份文档是 stable、temporary 还是 obsolete。
- 安全时删除 obsolete temporary docs。
- 仍有用但只是任务历史的临时文档，移动到 `.scratch/<feature-slug>/`。
- 添加稳定文档区域时，保持 `docs/README.md` 更新。

## 与其他技能配合

- 解析术语或稳定决策时，与 `grill-with-docs` 配合使用。
- 创建本地 markdown issue 文件时，与 `to-prd` 和 `to-issues` 配合使用。
- 写入 debug notes、trace 或临时假设时，与 `diagnose` 配合使用。
