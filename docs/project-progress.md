# TrendForge 项目进度

本文定义 TrendForge 的开发顺序和进度追踪方式。它是长期项目推进文档，不是临时任务记录。

## 项目目标

TrendForge 当前目标是一个本地可控的 AI 热点内容生产工作台：

```text
AIHot/RSS 来源输入 -> 简略信息校验 -> 筛选 -> BrowserAct/MediaCrawler 原文获取 -> 中文总结 -> 平台草稿 -> 图片资产审批 -> 微信公众号/小红书草稿 gate -> run history 和 review queue
```

Phase 1 已让 pipeline 可运行、可观察。Phase 2 增加生产控制面：source health、review queue、asset approval，以及显式的微信公众号/小红书真实草稿 gate。

## 进度模型

所有任务按端到端垂直切片推进。每个切片都应产出可独立演示或验证的行为。

允许的状态值：

- `planned`：方向已接受，尚未开始。
- `in-progress`：已有活跃工作。
- `blocked`：缺少决策、依赖、凭证、外部工作流或环境，无法继续。
- `done`：实现、验证和文档同步均已完成。

详细 PRD 和实现 issue 放在 `.scratch/<feature-slug>/`，规则见 `docs/agents/issue-tracker.md`。

## Phase 1 切片

| 顺序 | 切片 | 状态 | 验收信号 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | AIHot skill 输入跑到 review draft | done | CLI 和 pipeline 测试使用内置 AIHot fixture 跑通 source items、verified articles、selections、summaries、drafts、assets、publish plans 和 run events | 证明最高优先级 AI 热点路径可用。 |
| 2 | AIHot RSS 和通用 RSS/RSSHub fallback 跑到 review draft | done | RSS fixture 端到端测试证明 RSSHub 输入可进入筛选、BrowserAct 原文计划、总结、review/WeChat/XHS 草稿、assets、publish plans 和 run history readback | AIHot RSS live endpoint 仍是未来 source-quality 增强，不阻塞本地 RSS 切片。 |
| 3 | 校验失败能产生 BrowserAct planned command 和可诊断 run events | done | Pipeline 测试证明入选 HTTP source item 会创建 `fetch_full_text` BrowserAct planned events 和本地 handoff artifacts，BrowserAct 获取的 full text 会进入总结和草稿 | 保持困难页面可观察且默认安全；真实浏览器自动化通过 `FullTextProvider` 接入，MediaCrawler 仍需显式启用。 |
| 4 | 筛选和平台草稿生成有稳定测试入口 | done | Pipeline 测试通过 `createDefaultPipeline` 验证入选文章能生成 review、WeChat、XHS drafts、media plans、publish plans 和 run events | 稳定下游 adapter 工作。 |
| 5 | WeChat draft 映射到 `wechat-official-account-workflow` skill 契约 | done | Dry-run publish results 和 run events 包含 queued WeChat `plannedCommands` 与本地 publisher handoff artifact；真实草稿请求会在凭证/IP 白名单 gate 未就绪时 fail closed | 使用 `trendforge-adapter-contract`；真实草稿创建需要显式审批、凭证和 IP 白名单。 |
| 6 | XHS draft 映射到 `xhs-browser-draft-setup` skill 工作流 | done | Dry-run publish results 和 run events 包含 queued XHS `plannedCommands` 与本地 publisher handoff artifact；真实草稿请求会在 Hermes/bridge/extension/login gate 未就绪时 fail closed | 使用 `trendforge-adapter-contract`；真实草稿保存需要 Hermes/bridge/extension/login 健康。 |
| 7 | CLI/API 可查询 run history、items 和 drafts | done | CLI 和 API acceptance tests 使用稳定 run id 和内置 fixture 运行 AIHot/RSS pipeline，并通过 public surfaces 读回 runs、events、items 和 drafts | 让本地运行可检查；`TRENDFORGE_RUNS_DIR` 可隔离测试和实验历史。 |
| 8 | Source defaults 区分采集和原文获取 | done | Public source configuration 暴露 `defaultCollectorOrder` 和 `defaultFullTextAcquisitionOrder` | 防止把 BrowserAct 和 MediaCrawler 当成普通订阅源。 |
| 9 | 真实 BrowserAct 和模型 provider 由环境变量 gate 控制 | done | Provider tests 覆盖命令式 BrowserAct extraction 和 OpenAI-compatible chat-completions summaries；pipeline tests 证明模型总结进入草稿 | 默认保持确定性，除非配置 `TRENDFORGE_ENABLE_BROWSERACT=1` 或 `TRENDFORGE_TEXT_PROVIDER=openai-compatible`。 |
| 10 | Browser workbench 可视化管理本地 pipeline | done | `apps/web` 可构建，并暴露模型配置、WeChat 配置/token check、订阅管理、参数化 pipeline 运行、run/event 详情、原文 artifacts、草稿预览和 provider 验证入口；API tests 覆盖后端 | Phase 2 将其扩展为明确的 WeChat/XHS 草稿 gate 和 asset approval；正式发布保持禁用。 |

## Phase 2 切片

Phase 2 把可运行 pipeline 变成可控内容生产台。

| 顺序 | 切片 | 状态 | 验收信号 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | Human review 和 waiting queue | done | Pipeline/API tests 证明 run 会为缺失原文、summary、draft、publisher handoff 和 blocked platform gate 产生 review queue items；Web 将它们展示为生产控制项，`apps/web` 可构建 | 这是 run history 之上的第一层控制面。 |
| 2 | Web workbench 模块化 | done | `apps/web` 构建通过，包含 shared `types.ts`、`api.ts`、可复用 UI primitives，以及从大型入口拆出的 config/source/run/history/review/reader panel components | 保持行为稳定，同时让后续 Phase 2 面板更安全地添加。 |
| 3 | RSS/AIHot source health dashboard | done | Source health tests 覆盖 healthy、disabled、empty 状态；API 暴露 `/sources/health` 和 validation health；Web 展示 item counts、error categories、sample links 和 use-in-run 操作 | 在消耗模型/provider 成本前暴露 source 质量。 |
| 4 | WeChat 真实草稿创建 gate | done | WeChat unit/API tests 证明默认 dry-run 保持 queued、缺少配置 fail closed、token checks 做脱敏、`/publishers` 暴露 gate state，valid token 加 `coverMediaId` 可调用官方 draft/add API wrapper | 正式发布禁用；真实成功仍需要有效公众号凭证、IP 白名单和封面素材就绪。 |
| 5 | XHS 真实浏览器草稿保存 gate | done | XHS unit/API tests 证明 dry-run queued、禁用或缺少本地 workflow 会 fail closed、`/config/xhs` 和 `/verify/xhs` 暴露 gate state，真实保存需要 `check-login -> fill-publish -> save-draft` 加页面级草稿已保存信号 | 不只依赖命令退出码；真实保存仍需要 Hermes/bridge/extension/login 就绪。 |
| 6 | Image provider 和 asset approval | done | Pipeline/API tests 证明 WeChat 16:9 cover 和 XHS 3:4 images 会以 `needs-approval` 规划；review queue 暴露 asset approval 控制点，Web 可审批 assets，保存的 run 审批后会重建 queue | 默认仍是 prompt/placeholder 资产，直到接入真实 image provider/upload path。 |

## 每个切片的完成标准

切片只有满足以下条件才是 `done`：

- 行为能通过 CLI、API、pipeline 或 run store 这类 public interface 访问。
- 有可运行测试、命令或明确人工验收信号。
- Adapter 相关工作通过 `trendforge-adapter-contract` checklist。
- `.scratch/<feature-slug>/` 下的 PRD 或实现 issue 反映最终行为。
- 稳定设计变化同步到 `design/`、`CONTEXT.md` 或 `docs/adr/`。
- 不再有用的 `docs/working/` 临时文档已删除或归档。

## 文档同步循环

开发和文档同步推进：

1. 用 `grill-me` 或 `grill-with-docs` 澄清需求。
2. 在 `.scratch/<feature-slug>/` 写 PRD 和 issues。
3. 用 `tdd` 一次实现一个行为。
4. 只有实现证明决策稳定后才更新长期文档。
5. 标记切片 `done` 前运行 `trendforge-doc-lifecycle` cleanup。

旧 working notes 不覆盖当前代码、测试、设计文档或用户指令。如果文档与实现现实冲突，必须先显式解决冲突再继续。
