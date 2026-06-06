# 项目结构

TrendForge 当前采用本地优先的 TypeScript monorepo 骨架。

```text
TrendForge/
├─ apps/
│  ├─ api/
│  ├─ cli/
│  └─ web/
├─ packages/
│  ├─ core/
│  ├─ sources/
│  ├─ verifier/
│  ├─ selector/
│  ├─ generator/
│  ├─ media/
│  ├─ publishers/
│  ├─ storage/
│  └─ config/
├─ workflows/
│  ├─ wechat-official/
│  └─ xhs-browser-draft/
├─ workspace/
│  ├─ sources/
│  ├─ articles/
│  ├─ drafts/
│  ├─ assets/
│  ├─ previews/
│  └─ runs/
├─ vendor/
├─ tests/
├─ design/
├─ package.json
└─ tsconfig.json
```

## Apps

- `apps/cli`：本地命令入口。当前提供 `trendforge run` 的骨架调用。
- `apps/api`：本地 HTTP API。当前提供 `/health` 和 `/pipeline/run`。
- `apps/web`：浏览器工作台占位，第一阶段暂不实现。

## Packages

- `packages/core`：领域模型、接口和 pipeline 编排。
- `packages/sources`：RSSHub、BrowserAct、MediaCrawler 采集适配器骨架。
- `packages/verifier`：原文验证和全文补采接口。
- `packages/selector`：候选内容打分和 Top N 选择。
- `packages/generator`：审阅稿、公众号稿、小红书稿生成。
- `packages/media`：封面和图文素材规划。
- `packages/publishers`：公众号、小红书发布适配器骨架；默认不真实发布。
- `packages/storage`：本地 `workspace/runs` 状态存储。
- `packages/config`：默认 pipeline、采集器和合规配置。

## External Workflows

- `workflows/wechat-official`：公众号工作流封装入口，指向 `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md` 和对应 Node 工作流。
- `workflows/xhs-browser-draft`：小红书浏览器草稿链路封装入口，指向 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`。
- `vendor`：外部项目手动放置区，默认不下载 BrowserAct、RSSHub、MediaCrawler。

## Workspace

`workspace` 是运行数据目录，默认只保留 `.gitkeep`。实际采集结果、全文、草稿、图片、预览和运行记录不提交。
