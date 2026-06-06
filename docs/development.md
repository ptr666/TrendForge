# TrendForge 开发流程

本文定义 TrendForge 默认开发流程，面向人类开发者和 agent，是长期维护规则，不是临时任务记录。

## 开发原则

遵循仓库根目录 `AGENTS.md`：

- 改动保持简单，只覆盖当前需求。
- 优先做外科手术式修改，避免无关重构。
- 实现前明确成功标准。
- 验证实际改变的行为。
- 记录稳定决策，但不要把临时计划当成永久约束。

## 技能工作流

从想法进入实现时，默认使用已安装技能和仓库内自定义 skill 草案：

```text
grill-me 或 grill-with-docs
-> to-prd
-> to-issues
-> tdd
-> trendforge-doc-lifecycle cleanup
```

- 需求宽泛时用 `grill-me` 追问清楚。
- 术语、领域语言或稳定决策需要沉淀时用 `grill-with-docs`。
- 意图清楚后用 `to-prd` 描述用户问题和解决方案。
- 用 `to-issues` 把 PRD 拆成端到端垂直切片，写入本地 markdown issue tracker。
- 用 `tdd` 一次实现一个可观察行为。
- 遇到 bug、回归或 pipeline 结果不一致时用 `diagnose` 找根因。
- 测试难写或模块边界阻碍推进时，用 `improve-codebase-architecture`。

本地 issue tracker 规则见 `docs/agents/issue-tracker.md`。领域文档规则见 `docs/agents/domain.md`。

## Adapter 工作

新增或修改 adapter、planned command、publisher、source integration、workflow bridge、成功信号、失败信号、幂等规则、合规 gate 或证据保留行为前，先使用 `trendforge-adapter-contract`。

当前发布工作流事实：

- 微信公众号入口是 `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`，它管理本地 Node 工作流：article brief、Markdown、预览、检查、AI/本地封面策略、官方 API 图片上传、草稿创建和发布状态。
- 小红书入口是 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`，它围绕 `autoclaw-cc/xiaohongshu-skills`、Hermes、browser bridge、Chrome 扩展、登录态检查、页面填充、草稿保存和可选发布命令提供 share-safe 设置与排障。
- publish result 和 run event 应暴露结构化 `plannedCommands`，并为 dry-run 草稿创建写入本地 `artifactPath` handoff 文件。
- publisher handoff artifact 默认位于 `workspace/runs/<runId>/publisher-handoffs/`，内容包含 workflow 名称、平台草稿、planned commands 和验证信号。
- `--real-draft` 或 `allowRealDraft=true` 表示请求真实创建草稿，但 publisher adapter 必须在健康 gate 未就绪时 fail closed。

当前来源工作流事实：

- AI 热点信息优先通过 AIHot：`https://aihot.virxact.com/aihot-skill/`。
- AIHot RSS 是同源 fallback，优先级高于通用 RSSHub route。
- RSSHub 作为非 AIHot 的通用 RSS/RSSHub adapter。
- RSS 和 AIHot source item 可能包含简略正文，但完整原文获取属于入选后的 BrowserAct 或 MediaCrawler 阶段。
- BrowserAct 是入选 HTTP source item 的默认 planned command 原文获取路径。
- BrowserAct planned acquisition 默认在 `workspace/runs/<runId>/full-text-handoffs/` 写入本地 JSON handoff artifact，包含 source URL、command、成功信号和 MediaCrawler fallback 策略。
- `FullTextProvider` 是接入真实 BrowserAct 或 MediaCrawler extraction 的 pipeline seam；`TRENDFORGE_ENABLE_BROWSERACT=1` 启用命令式 BrowserAct provider。
- `TextProvider` 是模型总结的 pipeline seam；`TRENDFORGE_TEXT_PROVIDER=openai-compatible` 启用 OpenAI-compatible chat-completions provider。
- 测试应证明获取到的 full text 和模型总结会进入下游草稿。
- MediaCrawler 绝不是默认原文获取路径；必须显式启用并完成合规判断。

skill 草案位置：`docs/agents/custom-skills/trendforge-adapter-contract/SKILL.md`。

契约必须明确：

- Adapter 角色和 pipeline 阶段。
- 输入和输出契约。
- 可观察的成功/失败信号。
- 幂等 key。
- 为诊断保留的证据。
- 合规或显式启用要求。
- Dry-run 行为。
- 测试应覆盖的最高 public interface。

外部工作流命令默认只作为 planned command，除非用户显式开启真实执行。MediaCrawler 保持默认禁用。

## TDD 标准

实现任务应先通过 public interface 写行为测试。优先选择能覆盖真实路径的最高稳定入口：

- CLI 行为，用于本地用户工作流。
- API 行为，用于 HTTP-facing 工作流。
- `createDefaultPipeline`，用于端到端 pipeline 行为。
- `RunStore`，用于持久化 run state 和 event history。

每次只为一个行为写一个失败测试，写最少代码让它通过，再继续下一步。不要为想象中的未来行为批量写测试。

## 文档同步

每个实现任务结束前都要检查文档同步：

- 只有稳定系统设计或契约变化才更新 `design/`。
- 只有 agent 操作规则和 skill 配置才更新 `docs/agents/`。
- PRD、实现 issue 和任务讨论放入 `.scratch/<feature-slug>/`。
- 临时计划放 `docs/working/`。
- 只有稳定术语进入 `CONTEXT.md`。
- 只有难以回退、未来会疑惑、并且确实存在取舍的稳定决策才写 `docs/adr/`。

使用 `trendforge-doc-lifecycle` 做清理。skill 草案位置：`docs/agents/custom-skills/trendforge-doc-lifecycle/SKILL.md`。

不再指导当前工作的临时文档应删除或归档。

## 验证命令

默认验证：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

纯文档变更不要求跑业务测试，但要检查链接、引用和内容是否与 `AGENTS.md`、`docs/agents/issue-tracker.md`、`docs/agents/domain.md` 及相关自定义 skill 草案一致。

## 后台命令

后台优先工作流可通过 API 和 CLI 使用：

- `trendforge run`：运行完整本地 pipeline。
- `trendforge run --run-id <id>`：使用稳定 id 运行，便于复现 run history。
- `trendforge run --run-id <id> --query-file tests/fixtures/aihot/aihot-skill.json`：使用内置 AIHot fixture 运行端到端 pipeline。
- `trendforge run --run-id <id> --query-file tests/fixtures/rss/ai-workflow.xml`：使用内置 RSS fixture 运行端到端 pipeline。
- `trendforge run-subscription --subscription-id <id>`：运行启用的本地订阅源。
- `trendforge runs`：列出保存的 pipeline run。
- `trendforge events --run-id <id>`：读取某次运行的阶段 event。
- `trendforge sources`：输出 source adapter 默认值、原文获取默认值、AIHot 优先级和本地订阅。
- `trendforge publishers`：输出 publisher adapter health。

API 暴露匹配的查询入口：

- `POST /pipeline/run`
- `POST /pipeline/run` 可接受可选 `runId`，用于复现 run history。
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /sources/health`
- `GET /publishers`
- `GET /config/model`
- `PUT /config/model`
- `GET /config/wechat`
- `PUT /config/wechat`
- `GET /config/xhs`
- `PUT /config/xhs`
- `POST /verify/model`
- `POST /verify/wechat`
- `POST /verify/xhs`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `GET /review-queue`
- `GET /runs/:runId/review-queue`
- `POST /runs/:runId/assets/:assetId/approve`
- `GET /artifacts?path=<workspace/runs/...>`

`defaultCollectorOrder` 只描述简略信息采集：AIHot 优先，然后通用 RSS/RSSHub。`defaultFullTextAcquisitionOrder` 描述入选后的原文补全：BrowserAct 优先，MediaCrawler 仅在显式启用后可用。

设置 `TRENDFORGE_RUNS_DIR=<path>` 可在测试、实验或脚本验证时隔离 run history。
