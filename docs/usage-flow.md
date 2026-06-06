# TrendForge 完整使用流程

本文描述 TrendForge 当前可用的本地端到端运行流程。

TrendForge 是本地优先的 AI 热点内容生产工作台。默认安全路径只创建本地草稿、图片资产计划、review queue 和平台交接计划；正式发布始终禁用。

## 1. 安装与验证

安装依赖：

```powershell
npm.cmd install --cache .\.npm-cache
```

构建和测试：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

如果需要隔离 run history：

```powershell
$env:TRENDFORGE_RUNS_DIR = "G:\TrendForge\workspace\runs-dev"
```

## 2. 启动后台和 Web 工作台

终端 1：

```powershell
npm.cmd run api
```

终端 2：

```powershell
npm.cmd run web:dev
```

打开终端输出的 Vite 地址。Web 工作台默认访问 `http://127.0.0.1:4780`。

如需覆盖 API 地址：

```powershell
$env:VITE_TRENDFORGE_API = "http://127.0.0.1:4780"
```

## 3. 配置 provider

### 模型 provider

在 Web 工作台中配置：

- Provider：`openai-compatible`
- Base URL：`https://api.deepseek.com`
- Model：`deepseek-v4-flash`
- API key：只保存在本地，不提交仓库

等价环境变量：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

使用 Web 的 “Test model request” 或 `POST /verify/model` 验证模型路径。

### BrowserAct 原文获取

BrowserAct 是信息入选后的首选原文获取方式。

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
```

使用 Web 的 “Run BrowserAct URL” 或 `POST /verify/browseract` 验证 URL。

未启用 BrowserAct 时，入选 HTTP 内容仍会产生 planned command 和 handoff artifact，便于后续诊断或人工执行。

### MediaCrawler fallback

MediaCrawler 默认禁用。只有在完成合规判断后，才应显式开启。

使用 Web 的 “Check MediaCrawler” 或 `POST /verify/mediacrawler` 检查本地可用性。

## 4. 配置信息源

采集优先级：

```text
AIHot skill -> AIHot RSS -> RSS/RSSHub
```

BrowserAct 和 MediaCrawler 不是普通订阅源。它们只在内容入选后用于补全原文。

Web 工作台流程：

1. 打开 Sources。
2. 添加或编辑 `aihot`、`rss` 或 `rsshub` 订阅。
3. 点击 “Verify source”。
4. 查看 source health：状态、错误分类、item 数量、检查时间和示例链接。
5. 点击 “Use in run” 使用该订阅运行 pipeline。

CLI 查看来源：

```powershell
npm.cmd run cli -- sources
```

运行内置 fixture：

```powershell
npm.cmd run cli -- run --run-id aihot-demo --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id rss-demo --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
```

## 5. 运行 pipeline

默认 pipeline：

```text
AIHot/RSS 输入
-> 简略信息校验
-> 筛选
-> BrowserAct/MediaCrawler 原文获取
-> 中文总结
-> review/wechat/xhs 草稿
-> 图片资产规划
-> publisher handoff/gate
-> run history 和 review queue
```

CLI：

```powershell
npm.cmd run cli -- run --run-id local-run --query-file tests/fixtures/aihot/aihot-skill.json --platforms review,wechat,xhs --top-n 1
```

API：

```http
POST /pipeline/run
```

典型请求体：

```json
{
  "runId": "local-run",
  "requestedPlatforms": ["review", "wechat", "xhs"],
  "topN": 1,
  "allowBrowserFallback": true,
  "allowMediaCrawlerFallback": false,
  "allowRealDraft": false
}
```

Web：

1. 选择 source mode：AIHot latest、subscription 或 custom query/source。
2. 选择平台：review、wechat、xhs。
3. 设置 `topN`。
4. 选择是否允许 BrowserAct 和 MediaCrawler fallback。
5. 点击 “Run pipeline”。

## 6. 查看运行结果和产物

CLI：

```powershell
npm.cmd run cli -- runs
npm.cmd run cli -- events --run-id local-run
```

API：

- `GET /runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /items`
- `GET /drafts`
- `GET /artifacts?path=<workspace/runs/...>`

产物保存到 `workspace/runs/<runId>/`：

- `drafts/`：Review、微信公众号、小红书 Markdown 草稿。
- `full-text/`：保存后的原文 Markdown。
- `full-text-handoffs/`：BrowserAct planned extraction 交接文件。
- `publisher-handoffs/`：微信公众号和小红书平台交接 JSON。

Web Reader 面板可以通过 API-safe artifact reader 打开原文和草稿。

## 7. Review queue 和图片审批

每次运行都会产生明确的人类控制点：

- `original-text`：原文缺失或获取失败。
- `summary`：中文总结审阅。
- `draft`：平台草稿审阅。
- `asset`：图片资产审批。
- `publisher`：微信公众号/小红书 handoff 或 gate 状态。
- `pipeline`：运行级错误。

图片资产当前默认是 prompt-only 计划：

- 微信公众号封面：`16:9`
- 小红书图文：`3:4`

可以在 Web Review 面板审批，也可以调用：

```http
POST /runs/:runId/assets/:assetId/approve
```

审批会更新保存的 run，将该 asset 标记为 `approved`，清除 `approvalRequired`，重建 review queue，并追加 `asset_approval` event。

## 8. 微信公众号草稿 gate

微信公众号使用 `wechat-official-account-workflow` 契约和微信官方草稿 API。

Web 配置项：

- `appId`
- `appSecret`
- `coverMediaId`

健康检查：

- `GET /config/wechat`
- `PUT /config/wechat`
- `POST /verify/wechat`
- `GET /publishers`

真实草稿创建要求：

- `allowRealDraft=true`
- 微信配置已启用
- `appId` 和 `appSecret` 有效
- IP 白名单/token 就绪
- `coverMediaId` 就绪

正式发布保持禁用。当前允许的真实平台副作用只有“创建草稿”。

## 9. 小红书浏览器草稿 gate

小红书使用 `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`，底层依赖 `autoclaw-cc/xiaohongshu-skills`、Hermes、bridge、Chrome 扩展、登录态和页面级验证。

Web 配置项：

- XHS workflow directory，默认 `vendor/xiaohongshu-skills`
- Bridge URL，默认 `ws://localhost:9343`

健康检查：

- `GET /config/xhs`
- `PUT /config/xhs`
- `POST /verify/xhs`
- `GET /publishers`

真实保存要求：

```text
check-login -> fill-publish -> save-draft -> 页面级草稿已保存信号
```

不要只用命令退出码判断成功；浏览器页面必须出现草稿保存信号。

## 10. 安全默认值

- 默认运行只生成 dry-run publisher handoff。
- 真实平台草稿必须显式传入 `allowRealDraft=true`。
- 正式发布禁用。
- 密钥保存在环境变量或被 Git 忽略的 `workspace/config/`。
- `workspace/` 是运行状态，不是源码。
- MediaCrawler 必须显式启用并完成合规判断。

## 11. 验证清单

交付代码变更或用于生产审阅前运行：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

推荐后台 smoke：

```powershell
$env:TRENDFORGE_RUNS_DIR = Join-Path $env:TEMP ("trendforge-smoke-" + [guid]::NewGuid().ToString("N"))
npm.cmd run cli -- run --run-id smoke-aihot --query-file tests/fixtures/aihot/aihot-skill.json --top-n 1
npm.cmd run cli -- run --run-id smoke-rss --query-file tests/fixtures/rss/ai-workflow.xml --top-n 1
npm.cmd run cli -- events --run-id smoke-rss
```
