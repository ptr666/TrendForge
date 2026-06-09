# TrendForge 项目结构

本文用于快速区分源码、文档、外部参考和本地运行产物，避免后续整理文件时误删运行历史、凭证或上游参考包。

## 顶层目录

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `apps/api/` | 源码 | 本地 HTTP API，负责配置、pipeline、run history、artifact 和 publisher gate。 |
| `apps/web/` | 源码 | React + Vite Web 工作台，当前主界面是 AIHot-only 流程。 |
| `apps/cli/` | 源码 | 本地 CLI smoke 和开发入口。 |
| `packages/core/` | 源码 | Pipeline 编排、run result、review queue、类型契约。 |
| `packages/sources/` | 源码 | AIHot、RSS/RSSHub 等来源 adapter。 |
| `packages/providers/` | 源码 | 文本模型、图片模型、HTTP/BrowserAct 原文 provider。 |
| `packages/generator/` | 源码 | review/wechat/xhs 本地草稿生成。 |
| `packages/media/` | 源码 | 平台图片资产规划、命名、生成和关联。 |
| `packages/publishers/` | 源码 | WeChat/XHS publisher gate、handoff、真实草稿创建。 |
| `packages/config/` | 源码 | 本地配置读取与 masked public config。 |
| `packages/storage/` | 源码 | RunStore，本地 JSON/JSONL 存储。 |
| `packages/verifier/` | 源码 | 初始内容校验和原文状态。 |
| `tests/unit/` | 测试 | 单元和集成式回归测试。 |
| `tests/fixtures/` | 测试数据 | RSS、AIHot 等 fixture。 |
| `docs/` | 长期文档 | 使用流程、配置、开发规则、进度、维护说明。 |
| `design/` | 设计文档 | 稳定架构和产品设计说明。 |
| `.scratch/` | 临时任务材料 | 本地 PRD、issue、工作中材料；不作为长期规则来源。 |
| `workspace/` | 本地运行产物 | 配置、日志、run history、生成图片、草稿和 handoff。默认不提交。 |
| `vendor/` | 外部参考/子模块 | RSSHub、MediaCrawler、BrowserAct 等外部项目参考。 |
| `workflows/` | 工作流说明 | 平台 handoff 相关本地说明。 |
| `wechat-official-account-shareable/` | 外部参考 | 本地微信工作流参考包，不作为 TrendForge 源码主入口。 |
| `xhs-browser-draft-setup-package/` | 外部参考 | 本地小红书浏览器草稿 skill 参考包。 |

## 运行产物目录

`workspace/` 是本地运行状态目录，不应提交真实内容。

| 路径 | 说明 |
| --- | --- |
| `workspace/config/` | 本地模型、微信、小红书配置；可包含密钥，必须保持 ignored。 |
| `workspace/runs/<runId>.json` | 单次 pipeline 的最终 run result。 |
| `workspace/runs/<runId>.events.jsonl` | 单次 pipeline 的阶段事件，排查慢任务优先看这里。 |
| `workspace/runs/<runId>/full-text/` | 原文 Markdown。 |
| `workspace/runs/<runId>/drafts/` | review/wechat/xhs 本地 Markdown 草稿。 |
| `workspace/runs/<runId>/assets/` | 生成图片。 |
| `workspace/runs/<runId>/publisher-handoffs/` | 平台 handoff JSON。 |
| `workspace/*.log` | 一键启动脚本写入的 API/Web 日志。 |

## 整理规则

- 可以提交：`apps/`、`packages/`、`tests/`、`docs/`、`design/`、脚本和配置模板。
- 不提交：`workspace/config/*`、`workspace/runs/*`、`workspace/assets/*`、`.env*`、日志、pid、真实平台会话文件。
- 不随意删除：`workspace/runs/`。它是用户调试和回溯运行历史的依据；清理前应先导出或让用户确认。
- 不把外部参考包混入主实现：`vendor/`、`wechat-official-account-shareable/`、`xhs-browser-draft-setup-package/` 只作为 adapter/handoff 参考。

## 当前性能观察点

生成慢时优先看：

1. `workspace/runs/<runId>.events.jsonl`
2. `workspace/api.err.log`
3. `workspace/api.log`
4. `workspace/runs/<runId>/assets/` 图片数量与大小

已观察到的主要耗时来源：

- 热点分析会对多个 AIHot 条目调用评分模型。当前评分阶段已做有界并发，避免 20 条信息完全串行。
- 单条评分、原文或总结失败不会拖垮整轮分析；优先从 run events 里查看 `score_failed`、`screen_item_skipped`、`summary_fallback` 和 `candidate_backfill`。
- 草稿生成中的图片模型请求最慢，尤其每个微信草稿默认封面图和正文配图各 1 张。当前同一草稿的多张图片会并发请求，但不同草稿仍按草稿顺序推进，便于阶段事件和失败隔离。
- 微信真实上传每篇草稿需要 token/gate、封面上传、正文图上传和 `draft/add`，最近一次真实上传约 8 到 10 秒/篇。
