# TrendForge 项目进度

本文记录 TrendForge 的长期推进方式和当前阶段状态。任务按端到端切片推进，不按 package 横向拆分。

## Project Goal

第一阶段目标是打通本地 AI 热点内容生产 pipeline：

```text
AIHot 信息 -> 热点筛选 -> 原文补全 -> 中文总结 -> 候选评审 -> 多平台草稿 -> 配图计划 -> 平台 handoff -> run history
```

当前 Web 工作台优先稳定 AIHot-only 闭环。RSS/RSSHub 后端能力保留，但前端订阅入口暂时隐藏，避免公共 RSSHub 实例和网络代理问题干扰主链路验证。

## Progress Model

状态值固定为：

- `planned`：方向已确认，尚未开始。
- `in-progress`：已有活跃工作。
- `blocked`：缺少决策、依赖、凭证、外部工作流或环境。
- `done`：实现、验证和文档同步均已完成。

## Phase 1 Slices

| 顺序 | 切片 | 状态 | 验收信号 |
| --- | --- | --- | --- |
| 1 | AIHot 输入跑到 review draft | done | pipeline/CLI 测试能从 AIHot fixture 生成 source items、summaries、drafts、assets 和 run events。 |
| 2 | BrowserAct planned command 和可诊断 events | done | HTTP 原文缺失时写入 `fetch_full_text` planned event 和 handoff artifact。 |
| 3 | 平台草稿生成测试入口 | done | review、WeChat、XHS drafts 能通过 pipeline 生成并保存 artifact。 |
| 4 | WeChat draft adapter gate | done | dry-run 生成微信公众号 handoff；真实草稿路径 fail closed。 |
| 5 | XHS draft adapter gate | done | dry-run 生成小红书 planned commands；真实保存路径受 Hermes/bridge/login gate 控制。 |
| 6 | CLI/API 查询 run history、items、drafts | done | API 和 CLI 能读取 runs、events、items、drafts、artifacts。 |
| 7 | Web 工作台从 JSON 调试台改为用户流程界面 | done | 默认展示来源、候选、总结、评分、草稿和历史，原始 JSON 折叠。 |
| 8 | 来源管理与筛选来源选择分离 | done | 后端支持 source CRUD 和 run history 删除；保存订阅不自动进入筛选。 |
| 9 | AIHot 固定源与 RSSHub 订阅模型分离 | done | AIHot 作为固定源，RSS/RSSHub 作为用户订阅后端能力。 |
| 10 | Web 前端收敛为 AIHot-only 闭环 | done | 前端隐藏 RSS/RSSHub 接入，只展示 AIHot 日报、全选/选择、热点分析、候选评审、草稿生成和运行历史。 |

## Current Web Flow

当前 Web 主流程为：

```text
总览
-> AIHot 日报
-> 热点分析
-> 候选评审
-> 草稿生成
-> 阻塞与提醒
-> 运行历史
-> 配置
```

关键约定：

- 前端只把 `aihot-default` 作为来源传给 `/pipeline/screen`。
- 前端会传 `sourceItemIds`，确保只分析用户选中的 AIHot 条目。
- 候选筛选和草稿生成分离，草稿只处理用户勾选的候选。
- RSS/RSSHub API 保留，但不在当前主界面暴露。
- 原始 JSON 永远不是主内容，只作为调试折叠区。

## Next Slices

| 顺序 | 切片 | 状态 | 验收信号 |
| --- | --- | --- | --- |
| 1 | AIHot 日报展示质量打磨 | planned | 日报长内容滚动顺畅，条目标题、摘要、标签、链接和选择状态清晰。 |
| 2 | 候选详情阅读体验优化 | planned | 原因、总结、评分、原文以 tab 或折叠结构清晰展示，支持快速对比。 |
| 3 | 草稿预览增强 | planned | 微信和小红书草稿正文、标签、配图计划和 handoff 状态更接近最终发布视图。 |
| 4 | 恢复 RSS/RSSHub 前端入口 | planned | 仅在 AIHot 主链路稳定后恢复，且必须采用“预览/验证 -> 保存 -> 本次选择”的两段式流程。 |

## Documentation Sync Loop

每个切片完成后：

- 更新 `.scratch/<feature>/` issue 状态。
- 更新 `docs/project-progress.md`。
- 如果改变用户操作方式，同步 `docs/usage-flow.md` 和 README。
- 临时共识留在 `.scratch/<feature>/` 或 `docs/working/`。
- 稳定知识才进入 `design/`、`CONTEXT.md` 或 `docs/adr/`。
- 废弃 working docs 要删除或归档。

## Encoding Note

本轮发现多个中文前端文件和文档出现 mojibake。原因是中文字符串曾被错误编码保存或错误解码后再次写入。

后续规则：

- 中文编辑优先使用 `apply_patch`。
- 不用未声明编码的 shell 重定向批量写中文。
- 文档变更后检查中文可读性。
- Web 文案变更后运行 `npm.cmd run web:build`。
