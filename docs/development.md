# TrendForge 开发流程

本文定义 TrendForge 默认开发流程，面向人类开发者和 agent。它是长期维护规则，不是临时任务记录。

## Development Principles

遵循仓库根目录 `AGENTS.md`：

- 改动保持简单，只覆盖当前需求。
- 优先做外科手术式修改，避免无关重构。
- 实现前明确成功标准。
- 验证实际改变的行为。
- 记录稳定决策，但不要把临时计划当成永久约束。

## Skill Workflow

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
- 意图清晰后用 `to-prd` 描述用户问题和解决方案。
- 用 `to-issues` 把 PRD 拆成端到端垂直切片，写入本地 markdown issue tracker。
- 用 `tdd` 一次实现一个可观察行为。
- 遇到 bug、回归或 pipeline 结果不一致时用 `diagnose` 找根因。
- 测试难写或模块边界阻碍推进时，用 `improve-codebase-architecture`。

本地 issue tracker 规则见 `docs/agents/issue-tracker.md`。领域文档规则见 `docs/agents/domain.md`。

## Adapter Work

新增或修改 adapter、publisher、planned command、source integration、workflow bridge、成功信号、失败信号、限流规则、合规 gate 或证据保留行为前，先使用 `trendforge-adapter-contract`。

当前发布工作流事实：

- 微信公众号入口使用微信官方 API 创建草稿，真实链路为 token、封面永久素材、正文图片转存、draft/add。
- 小红书入口依赖 `autoclaw-cc/xiaohongshu-skills`、Hermes、browser bridge、Chrome 扩展、登录态和页面级保存信号。
- publisher handoff artifact 默认位于 `<runsDir>/<runId>/publisher-handoffs/`。
- `/pipeline/drafts` 只生成本地 review/wechat/xhs 草稿；`/pipeline/publish-drafts` 才从已生成草稿推进 publisher handoff 或真实平台草稿。
- `--real-draft` 或 `allowRealDraft=true` 表示请求真实创建平台草稿，但 publisher adapter 必须在健康 gate 未就绪时 fail closed。
- 正式发布仍保持禁用，除非后续单独开需求。

当前来源和原文获取事实：

- AI 热点信息优先通过 AIHot：`https://aihot.virxact.com/aihot-skill/`。
- AIHot 是固定默认源，内部 ID 为 `aihot-default`，不属于用户可添加的 RSS/RSSHub 渠道库。
- RSSHub 是通用 RSS/RSSHub adapter，支持 `rsshub://anthropic/research`、`/anthropic/research`、`anthropic/research` 和完整 RSSHub URL。
- 用户渠道库只维护 RSS 和 RSSHub；渠道 ID 由后端根据规范化来源自动生成。
- HTTP full-text provider 是默认原文获取能力，会从入选候选 URL 抓取 HTML/Markdown/plain text 并保存 Markdown。
- BrowserAct 只在 `TRENDFORGE_ENABLE_BROWSERACT=1` 时作为 HTTP 原文抓取失败后的 fallback。
- MediaCrawler 不是默认原文获取路径，必须显式启用并完成合规判断。
- 旧文案 `Original text acquisition planned for BrowserAct.` 只能作为历史兼容信息理解，不应再出现在候选风险提示中。

## Provider Boundaries

- 文本模型 provider 负责中文原文翻译、中文总结、角度提炼、关键点和风险提示。
- OpenAI-compatible text provider 必须要求模型返回 `title`、`translatedOriginal`、`summary`、`angle`、`keyPoints`、`riskNotes`。
- deterministic text provider 只提供可测试占位，不假装完成英文原文翻译。
- 图片 provider 与文本 provider 分离。未配置图片 provider 时，默认不规划图片资产、不生成图片 prompt、不创建图片审批队列。
- 显式配置图片 provider 后，微信公众号默认 16:9 封面，小红书默认 3:4 图文资产，并进入人工审批。

## TDD Standard

实现任务应先通过 public interface 写行为测试。优先选择能覆盖真实路径的最高稳定入口：

- CLI 行为，用于本地用户工作流。
- API 行为，用于 HTTP-facing 工作流。
- `createDefaultPipeline`，用于端到端 pipeline 行为。
- `RunStore`，用于持久化 run state 和 event history。
- provider 工厂，用于模型、HTTP 原文获取、BrowserAct、图片 provider 等可替换能力。

每次只为一个行为写一个失败测试，写最少代码让它通过，再继续下一步。不要为想象中的未来行为批量写测试。

## Documentation Sync

每个实现任务结束前都要检查文档同步：

- 只有稳定系统设计或契约变化才更新 `design/`。
- 只有 agent 操作规则和 skill 配置才更新 `docs/agents/`。
- PRD、实现 issue 和任务讨论放入 `.scratch/<feature-slug>/`。
- 临时计划放 `docs/working/`。
- 只有稳定术语进入 `CONTEXT.md`。
- 只有难以回退、未来会疑惑、并且确实存在取舍的稳定决策才写 `docs/adr/`。
- 用户可见流程变化必须同步 `README.md`、`docs/usage-flow.md`、`docs/project-progress.md`。

使用 `trendforge-doc-lifecycle` 做清理。skill 草案位置：`docs/agents/custom-skills/trendforge-doc-lifecycle/SKILL.md`。

## Encoding Rules

TrendForge Web 和中文文档默认使用 UTF-8。不要通过 Windows shell 管道、未指定 UTF-8 的 Python/PowerShell 脚本、`Set-Content` 默认编码或其他会受控制台代码页影响的方式写入中文源码和中文文档。

已确认的乱码根因：曾通过 Windows shell/Python 管道写入中文 JSX 和 Markdown，非 ASCII 字符在写入链路中被替换为连续问号，或产生 UTF-8/GBK mojibake。这不是浏览器 charset 问题，而是源文件内容已经损坏。

安全做法：

- 手工补丁优先使用 `apply_patch`。
- 若必须使用脚本改文件，脚本内容避免直接嵌入中文，或明确使用 UTF-8 并在写入后用测试验证。
- 修改中文 UI、provider prompt、generator 模板或文档后必须运行 `npm.cmd test`，其中 `tests/unit/encoding.test.ts` 会检查核心 Web 文案、provider、generator 和文档是否出现连续问号或典型 mojibake marker。

## Verification Commands

默认验证：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

纯文档变更不强制跑业务测试，但要检查链接、引用和内容是否与 `AGENTS.md`、`docs/agents/issue-tracker.md`、`docs/agents/domain.md` 及相关自定义 skill 草案一致。若文档涉及中文编码修复，仍建议运行 `npm.cmd test` 触发编码扫描。
