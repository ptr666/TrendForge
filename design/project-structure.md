# 项目结构

TrendForge 当前采用本地优先的 TypeScript monorepo。

```text
TrendForge/
|-- apps/
|   |-- api/
|   |-- cli/
|   `-- web/
|-- packages/
|   |-- core/
|   |-- sources/
|   |-- verifier/
|   |-- selector/
|   |-- providers/
|   |-- generator/
|   |-- media/
|   |-- publishers/
|   |-- storage/
|   `-- config/
|-- workflows/
|   |-- wechat-official/
|   `-- xhs-browser-draft/
|-- workspace/
|   |-- config/
|   |-- runs/
|   |-- sources/
|   |-- articles/
|   |-- drafts/
|   |-- assets/
|   `-- previews/
|-- vendor/
|-- tests/
|-- design/
|-- docs/
|-- package.json
`-- tsconfig.json
```

## Apps

- `apps/cli`：本地命令入口，支持 pipeline 运行、订阅运行、run history、events、sources 和 publishers 查询。
- `apps/api`：本地 HTTP API，支持配置、验证、pipeline 运行、run/artifact 查询、review queue 和 asset approval。
- `apps/web`：浏览器工作台，用于可视化管理模型、订阅源、pipeline 运行、review queue、原文/草稿阅读和平台 gate。

## Packages

- `packages/core`：领域模型、接口和 pipeline 编排。
- `packages/sources`：AIHot、RSS/RSSHub、BrowserAct、MediaCrawler source/full-text 相关 adapter。
- `packages/verifier`：source item 校验和原文补全接口。
- `packages/selector`：候选内容打分和 Top N 选择。
- `packages/providers`：BrowserAct provider、确定性 text provider、OpenAI-compatible provider 等真实 provider seam。
- `packages/generator`：Review、微信公众号、小红书草稿生成。
- `packages/media`：封面和图文素材规划。
- `packages/publishers`：微信公众号、小红书发布/草稿 adapter；默认不正式发布。
- `packages/storage`：本地 `workspace/runs` 状态、event 和 artifact 存储。
- `packages/config`：默认 pipeline、采集器、订阅、模型、微信和小红书本地配置。

## External Workflows

- `workflows/wechat-official`：TrendForge 内部的微信公众号工作流说明和封装入口，指向 `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md` 及对应 Node 工作流。
- `workflows/xhs-browser-draft`：TrendForge 内部的小红书浏览器草稿链路说明和封装入口，指向 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`。
- `vendor`：外部项目放置区，可用于 BrowserAct、RSSHub、MediaCrawler 等 submodule 或本地安装内容。

## Workspace

`workspace` 是运行数据目录，默认不提交。

常见内容：

- `workspace/config/`：本地配置和密钥占位，必须保持 Git 忽略。
- `workspace/runs/`：run history、events、drafts、full text、publisher handoffs。
- `workspace/sources/`：本地 source 或订阅相关运行数据。
- `workspace/articles/`：文章中间产物。
- `workspace/drafts/`：草稿输出。
- `workspace/assets/`：图片资产计划或本地产物。
- `workspace/previews/`：预览产物。

不要把 API key、cookie、token、浏览器 profile、账号截图或平台草稿运行产物提交到仓库。
