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

## 运行 CLI

```powershell
npm.cmd run cli -- run --query "AI workflow demo" --platforms review,wechat,xhs
```

命令会把运行记录写入 `workspace/runs/`。

## 运行 API

```powershell
npm.cmd run api
```

可用接口包括：

- `GET /health`
- `GET /providers`
- `GET /config/model`
- `PUT /config/model`
- `GET /config/wechat`
- `PUT /config/wechat`
- `GET /config/xhs`
- `PUT /config/xhs`
- `GET /subscriptions`
- `PUT /subscriptions`
- `POST /subscriptions/validate`
- `POST /verify/rss`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `POST /verify/model`
- `POST /verify/wechat`
- `POST /verify/xhs`
- `POST /pipeline/run`
- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `POST /runs/:runId/assets/:assetId/approve`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /sources/health`
- `GET /publishers`
- `GET /review-queue`
- `GET /artifacts?path=<workspace/runs/...>`

真实平台草稿默认禁用；只有显式开启 real-draft，并通过健康检查后才会创建草稿。正式发布保持禁用。

## 运行 Web UI

先启动 API，再启动本地 Vite 工作台：

```powershell
npm.cmd run api
npm.cmd run web:dev
```

UI 默认访问 `http://127.0.0.1:4780`。如需覆盖：

```powershell
$env:VITE_TRENDFORGE_API = "http://127.0.0.1:4780"
```

当前 Web 工作台包含：

- RSS 订阅源管理与验证。
- BrowserAct 原文获取验证。
- MediaCrawler 配置检查。
- OpenAI-compatible 模型验证。
- 微信公众号和小红书 publisher gate 检查。
- Review queue、图片资产审批、pipeline run history、草稿、资产和 handoff artifact 路径查看。

## 可选真实 provider

默认 pipeline 保持确定性，并适合本地测试。只有在本地工具和凭证准备好后，才启用真实 provider。

### BrowserAct 原文获取

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
npm.cmd run cli -- run --run-id browseract-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
```

启用后，入选 HTTP source item 会执行：

```text
browser-act stealth-extract <url> --content-type markdown
```

成功时 `VerifiedArticle.fullText` 会被填充，`fetch_full_text` event 变为 `verified`；失败时会记录 BrowserAct 错误信息。

### OpenAI-compatible text provider

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.openai.com/v1"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "gpt-4.1-mini"
npm.cmd run cli -- run --run-id model-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
```

provider 调用 `/chat/completions`，并期望模型返回包含 `title`、`summary`、`angle`、`keyPoints` 和 `riskNotes` 的 JSON 内容。

### 真实端到端 smoke

凭证只通过当前进程环境变量传入，不写入仓库文件。

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
npm.cmd run cli -- run --run-id real-e2e-smoke --query "https://openai.com/news/rss.xml" --platforms review,wechat,xhs --top-n 1
```

运行后，Review、微信公众号和小红书 Markdown 草稿会写入 `workspace/runs/<run-id>/drafts/`；BrowserAct 原文证据会记录到 `workspace/runs/<run-id>.events.jsonl` 和对应 run 产物中。

## 完整流程

完整操作说明见 [完整使用流程](usage-flow.md)，其中包括 Web 工作台、source health、review queue、asset approval 和微信公众号/小红书草稿 gate。
