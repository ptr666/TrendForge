# TrendForge 项目进度

本文记录 TrendForge 的长期推进方式和当前阶段状态。任务按端到端切片推进，不按 package 横向拆分。

## Project Goal

第一阶段目标是打通本地 AI 热点内容生产 pipeline：

```text
AIHot 信息 -> 热点筛选 -> 原文补全 -> 中文译文/中文总结
-> 候选评审 -> 多平台草稿 -> 平台 handoff -> run history
```

当前 Web 工作台优先稳定 AIHot-only 闭环。RSS/RSSHub 后端能力保留，但前端订阅入口暂时隐藏。

## Progress Model

状态值固定为：

- `planned`：方向已确认，尚未开始。
- `in-progress`：已有活跃工作。
- `blocked`：缺少决策、依赖、凭证、外部工作流或环境。
- `done`：实现、验证和文档同步均已完成。

## Phase 1 Slices

| 顺序 | 切片 | 状态 | 验收信号 |
| --- | --- | --- | --- |
| 1 | AIHot 输入跑到 review draft | done | pipeline/CLI 测试能从 AIHot fixture 生成 source items、summaries、drafts 和 run events。 |
| 2 | 默认 HTTP 原文获取 | done | 入选 HTTP URL 会执行 HTTP full-text provider，生成 `full-text/*.md`；失败原因写入 events。 |
| 3 | BrowserAct/MediaCrawler 显式 fallback | done | BrowserAct 只在显式启用 provider 时执行；MediaCrawler 只在显式开启 fallback 时 planned。 |
| 4 | 候选评审无 planned 风险污染 | done | 候选 `riskNotes` 不显示 `Original text acquisition planned for BrowserAct.`。 |
| 5 | 中文译文和中文总结契约 | done | OpenAI-compatible provider 要求返回 `translatedOriginal`、`summary`、`angle`、`keyPoints`、`riskNotes`；默认 provider 不假装翻译。 |
| 6 | 平台草稿生成测试入口 | done | review、WeChat、XHS drafts 能通过 pipeline 生成并保存本地 artifact；不自动创建 publisher handoff。 |
| 7 | 图片生成默认关闭与真实 provider | done | 未配置图片 provider 时，pipeline 不生成 assets；配置 OpenAI-compatible 图片模型后，可真实生成微信 16:9 与小红书 3:4 图片到 `workspace/runs/<runId>/assets/`，并支持单图重生成。 |
| 8 | WeChat draft adapter gate | done | 平台推进阶段 dry-run 生成微信公众号 handoff；真实草稿路径 fail closed；支持 AppID/AppSecret、legacyCredentialSource 和本地封面路径；真实链路按 token -> add_material -> uploadimg -> draft/add 执行。 |
| 9 | XHS draft adapter gate | done | dry-run 生成小红书 planned commands；真实保存受 Hermes/bridge/login gate 控制。 |
| 10 | CLI/API 查询 run history、items、drafts、artifacts | done | API 和 CLI 能读取 runs、events、items、drafts、artifacts；`GET /runs` 返回 `runsDir`。 |
| 11 | Web 从 JSON 调试台改为用户流程界面 | done | 默认展示 AIHot、候选、中文译文、总结、评分、草稿、历史；原始 JSON 折叠。 |
| 12 | Artifact 阅读器 | done | “打开原文 Markdown”“打开 Markdown 产物”“打开 publisher handoff”在当前页面打开渲染预览；Markdown 默认隐藏 frontmatter，JSON handoff 默认结构化展示，原始内容折叠保留。 |
| 13 | 真实平台草稿推进开关 | done | Web 默认 dry-run；勾选真实草稿后需要二次确认，并由后端 gate 控制。 |
| 14 | AIHot-only 前端闭环 | done | 前端隐藏 RSS/RSSHub 接入，只展示 AIHot 日报、全选/选择、热点分析、候选评审、草稿生成和运行历史。 |
| 15 | 草稿生成与平台推进拆分 | done | `/pipeline/drafts` 只生成本地草稿和图片计划；`/pipeline/publish-drafts` 才从已生成草稿执行 publisher handoff 或真实草稿 gate。 |
| 16 | 运行历史布局稳定性 | done | 左侧 run 列表与右侧 artifact 阅读器使用稳定 grid、内部滚动、长文本换行和 `min-width: 0`，避免长 runId、URL 或 Markdown/JSON 撑开页面。 |
| 17 | 草稿生成图文闭环 | done | 生成草稿时同步生成平台图片、图文预览、单图重生成，并把生成封面/正文图接入微信草稿箱和 XHS handoff。 |
| 18 | 真实微信草稿箱验证 | done | 2026-06-09 使用真实微信 gate 跑通 `AIHot -> 候选 -> 微信草稿 -> 生成封面/正文图 -> publish-drafts -> draft/add`；run events 返回 `Official draft/add response returned media_id.`，handoff 未包含 access token。 |
| 19 | 图片请求超时保护 | done | OpenAI-compatible 图片 provider 增加单次请求超时；图片模型卡住时单张图片失败不应阻断文字草稿、已有图片和平台 handoff 保存。 |
| 20 | 长任务进度按阶段切片 | done | Web 轮询 `/runs/:runId/events` 时按 `screen`、`draft_generation`、`platform_publish` 各自阶段计算进度；热点分析阶段的原文失败提醒不会在草稿生成阶段重复出现；草稿生成写入 `compose_media` started/draft_started/draft_finished/finished 事件。 |
| 21 | 阻塞与提醒只显示异常 | done | 正常生成的图片不再进入 review queue 或审批流程；图片预览和单图重生成留在草稿页，只有 blocked 图片资产、publisher gate 和 pipeline 错误进入阻塞与提醒。 |
| 22 | 微信 Markdown 上传排版修复 | done | 微信 publisher 在 `draft/add` 前把本地 Markdown 草稿转换为微信 HTML，处理标题、段落、列表、引用和正文图片，避免 Markdown 标记原样进入公众号草稿箱。 |
| 23 | 生成性能初步优化 | done | 根据 run events 定位慢点：评分模型和图片模型为主要瓶颈；评分阶段默认 4 并发，同一草稿的多张图片并发生成，并新增项目结构文档说明运行产物边界。 |
| 24 | Pipeline 单条失败隔离 | done | 单条评分失败记 0 分并跳过，原文不可用继续补足候选，文本总结失败使用中文兜底摘要；run events 记录 `score_failed`、`screen_item_skipped`、`summary_fallback`、`candidate_backfill`。 |
| 25 | 图片状态与异常提醒语义收敛 | done | 成功图片状态改为 `ready`，失败图片为 `failed`/`blocked`；阻塞与提醒只展示 pipeline、图片和 publisher gate 异常，不再承载 summary/draft/image 审批流程。 |
| 26 | Web 草稿页去旧版预览 | done | 草稿生成只保留新版三栏工作台；运行历史和 artifact viewer 解耦，旧版草稿卡片不再重复渲染。 |

## Current Web Flow

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
- 草稿生成和平台草稿推进分离，用户先审阅本地草稿，再单独推进 handoff 或真实草稿 gate。
- HTTP 原文抓取是默认能力；BrowserAct 和 MediaCrawler 是显式 fallback。
- 文本模型负责真实中文译文和总结；deterministic provider 只提供可测试占位。
- 图片模型独立于文本模型；未配置时不生成图片资产，配置后可真实生成本地图文资产，但不自动上传平台；图片调整在草稿页完成，阻塞与提醒只展示异常。
- 长任务进度按当前任务阶段切片；草稿生成可显示媒体合成阶段、已处理草稿数和耗时。
- 热点评分使用有界并发；图片生成在同一草稿内并发处理封面和正文图。
- 单条模型或原文失败不会拖垮整轮热点分析；失败条目写入 skipped 摘要，系统继续尝试补足候选数量。
- RSS/RSSHub API 保留，但不在当前主界面暴露。
- 原始 JSON 只作为调试折叠区。
- 启动脚本不会清空 run history；Web 显示当前 `runsDir`。

## Next Slices

| 顺序 | 切片 | 状态 | 验收信号 |
| --- | --- | --- | --- |
| 1 | 候选详情对比增强 | planned | 原因、中文译文、总结、评分、原文可更快横向对比。 |
| 2 | 草稿预览细节增强 | planned | 继续优化微信排版、XHS 轮播细节、图片替换和平台 handoff 状态提示。 |
| 3 | 小红书真实草稿手动演练 | planned | 微信真实草稿箱链路已跑通；下一步使用小红书登录态跑一次 dry-run -> gate -> real draft saved signal 的人工验收。 |
| 4 | 恢复 RSS/RSSHub 前端入口 | planned | AIHot 主链路稳定后恢复；必须采用“预览/验证 -> 保存 -> 本次选择”的两段式流程。 |

## Documentation Sync Loop

每个切片完成后：

- 更新 `.scratch/<feature>/` issue 状态。
- 更新 `docs/project-progress.md`。
- 如果改变用户操作方式，同步 `docs/usage-flow.md` 和 README。
- 临时共识留在 `.scratch/<feature>/` 或 `docs/working/`。
- 稳定知识才进入 `design/`、`CONTEXT.md` 或 `docs/adr/`。
- 废弃 working docs 要删除或归档。

## Encoding Note

本项目曾出现中文 mojibake。后续中文编辑必须使用安全写入方式，优先 `apply_patch`，避免未声明编码的 shell 重定向。Web 文案、provider prompt、generator 模板或文档变更后运行：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```
