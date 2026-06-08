# 本地环境

## 环境要求

- Node.js 20 或更高版本
- npm
- Git

## 安装

这台机器建议使用项目内 npm cache，因为全局 npm cache 可能指向 workspace 之外：

```powershell
npm.cmd install --cache .\.npm-cache
```

## 验证

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

## 一键启动和停止

Windows 推荐直接使用根目录脚本：

```powershell
.\start-trendforge.bat
```

脚本会自动执行 `npm.cmd run build`，分别启动 API 和 Web，并在就绪后打开：

```text
http://127.0.0.1:5173/
```

API 固定地址：

```text
http://127.0.0.1:4780
```

停止服务：

```powershell
.\stop-trendforge.bat
```

日志写入：

- `workspace/api.log`
- `workspace/api.err.log`
- `workspace/web.log`
- `workspace/web.err.log`

## 手动运行

终端 1：

```powershell
npm.cmd run api
```

终端 2：

```powershell
npm.cmd run web:dev
```

Web UI 默认访问 `http://127.0.0.1:4780`。如需覆盖：

```powershell
$env:VITE_TRENDFORGE_API = "http://127.0.0.1:4780"
```

## 运行 CLI

CLI 仍可用于开发 smoke：

```powershell
npm.cmd run cli -- run --query "AI workflow demo" --platforms review,wechat,xhs
```

命令会把运行记录写入 `workspace/runs/`。

## 可用 API

基础状态：

- `GET /health`
- `GET /providers`

配置：

- `GET /config/model`
- `PUT /config/model`
- `GET /config/rsshub`
- `PUT /config/rsshub`
- `GET /config/wechat`
- `PUT /config/wechat`
- `GET /config/xhs`
- `PUT /config/xhs`

订阅和来源：

- `GET /subscriptions`
- `PUT /subscriptions`
- `POST /subscriptions/upsert`
- `DELETE /subscriptions/:sourceId`
- `POST /subscriptions/validate`
- `GET /sources`
- `GET /sources/health`
- `POST /verify/rss`

分步 pipeline：

- `POST /pipeline/screen`
- `POST /pipeline/drafts`
- `POST /pipeline/run`，保留为开发 smoke 和旧式一键 pipeline 入口

运行记录：

- `GET /runs`
- `DELETE /runs`
- `GET /runs/:runId`
- `DELETE /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /items`
- `GET /drafts`
- `GET /review-queue`
- `GET /artifacts?path=<workspace/runs/...>`

provider 和平台检查：

- `POST /verify/model`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `POST /verify/wechat`
- `POST /verify/xhs`
- `GET /publishers`
- `POST /runs/:runId/assets/:assetId/approve`

真实平台草稿默认禁用；只有显式开启 real draft，并通过健康检查后才会创建草稿。正式发布保持禁用。

## Web 工作台功能

当前 Web 工作台是普通用户主入口，不再是 JSON 调试台。主要功能包括：

- 模型接入设置和验证，支持 OpenAI-compatible provider。
- RSSHub base URL 配置，支持 `rsshub://anthropic/research` 这类 route 地址。
- AIHot、RSS、RSSHub 渠道库管理：添加、编辑、验证、启用/禁用、删除。
- 筛选任务来源选择：从已保存渠道中多选本次要使用的来源，并设置候选数量。
- 候选评审卡片：标题、来源、评分、入选理由、原文链接、原文状态、中文总结和风险提示。
- 人工勾选候选后再生成 review、微信公众号、小红书草稿。
- 草稿预览、图片计划、Markdown 产物和 publisher handoff 查看。
- “需要处理的问题”：只展示异常、缺失原文、图片待审批和平台 gate 阻塞。
- 运行历史查看、恢复、单条删除、清空全部、events、artifacts 和折叠调试 JSON。

## 可选真实 provider

默认 pipeline 保持确定性，适合本地测试。只有在本地工具和凭证准备好后，才启用真实 provider。

### BrowserAct 原文获取

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
npm.cmd run cli -- run --run-id browseract-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
```

启用后，入选 HTTP source item 会执行类似命令：

```text
browser-act stealth-extract <url> --content-type markdown
```

成功时 `VerifiedArticle.fullText` 会被填充，`fullTextArtifactPath` 指向 `workspace/runs/<runId>/full-text/` 下的 Markdown 文件；失败时会记录 BrowserAct 错误信息和 planned command。

### OpenAI-compatible text provider

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
npm.cmd run cli -- run --run-id model-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
```

provider 调用 `/chat/completions`，并期望模型返回包含 `title`、`summary`、`angle`、`keyPoints` 和 `riskNotes` 的 JSON 内容。

### 真实端到端 smoke

凭证只通过当前进程环境变量传入，不写入仓库文件：

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
npm.cmd run cli -- run --run-id real-e2e-smoke --query "https://openai.com/news/rss.xml" --platforms review,wechat,xhs --top-n 1
```

运行后，Review、微信公众号和小红书 Markdown 草稿会写入 `workspace/runs/<run-id>/drafts/`；原文证据会写入 `workspace/runs/<run-id>/full-text/` 和对应 run events。

## 完整流程

完整操作说明见 [完整使用流程](usage-flow.md)，其中包括 Web 工作台、RSSHub 配置、候选筛选、人工选择、草稿生成、source health、需要处理的问题、asset approval 和微信/小红书草稿 gate。
