# 本地环境

## 环境要求

- Node.js 20 或更高版本
- npm
- Git

## 安装

建议使用项目内 npm cache：

```powershell
npm.cmd install --cache .\.npm-cache
```

## 验证

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

## 一键启动和停止

Windows 推荐使用根目录脚本：

```powershell
.\start-trendforge.bat
```

脚本会执行 `npm.cmd run build`，分别启动 API 和 Web，并在就绪后打开：

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

运行日志写入：

- `workspace/api.log`
- `workspace/api.err.log`
- `workspace/web.log`
- `workspace/web.err.log`

启动脚本不会清空运行历史。运行历史默认在 `workspace/runs/`，也可以通过 `TRENDFORGE_RUNS_DIR` 覆盖。Web 运行历史区域会显示当前 `runsDir`。

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

## CLI

CLI 可用于开发 smoke：

```powershell
npm.cmd run cli -- run --query "AI workflow demo" --platforms review,wechat,xhs
```

命令会把运行记录写入当前 runsDir。

## 可用 API

基础状态：

- `GET /health`：返回 API 状态和 `runsDir`。
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

来源：

- `GET /sources/aihot/latest`
- `GET /sources`
- `GET /sources/health`
- `GET /subscriptions`
- `PUT /subscriptions`
- `POST /subscriptions/upsert`
- `DELETE /subscriptions/:sourceId`
- `POST /subscriptions/validate`

分步 pipeline：

- `POST /pipeline/screen`
- `POST /pipeline/drafts`
- `POST /pipeline/publish-drafts`
- `POST /pipeline/run`：保留为开发 smoke 和旧式一键 pipeline 入口。

运行记录：

- `GET /runs`：返回 runs 和 `runsDir`。
- `DELETE /runs`
- `GET /runs/:runId`
- `DELETE /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /items`
- `GET /drafts`
- `GET /review-queue`
- `GET /artifacts?path=<runsDir 内路径>`

provider 和平台检查：

- `POST /verify/model`
- `POST /verify/browseract`
- `POST /verify/mediacrawler`
- `POST /verify/wechat`
- `POST /verify/xhs`
- `GET /publishers`
- `POST /runs/:runId/assets/:assetId/approve`
- `GET /runs/:runId/assets/:assetId/file`
- `POST /runs/:runId/assets/:assetId/regenerate`

真实平台草稿默认禁用；只有显式开启 real draft，并通过健康检查后才会创建草稿。正式发布仍保持禁用。

## 可选真实 provider

更完整的配置清单见 [完整配置指南](configuration.md)。本节只保留本地启动和常用 provider 的快速说明。

### HTTP 原文获取

HTTP 原文 provider 默认启用。入选候选有 HTTP URL 时，会尝试抓取 HTML/Markdown/plain text，抽取正文并写入：

```text
<runsDir>/<runId>/full-text/
```

### BrowserAct fallback

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
```

启用后，HTTP 原文抓取失败时可以由 BrowserAct provider 继续尝试：

```text
browser-act stealth-extract <url> --content-type markdown
```

### OpenAI-compatible text provider

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

provider 调用 `/chat/completions`，并期望模型返回包含 `title`、`translatedOriginal`、`summary`、`angle`、`keyPoints` 和 `riskNotes` 的 JSON。

### 图片 provider

图片 provider 与文本 provider 分离。可在 Web 工作台“配置”区保存图片生成模型；配置文件位于 `workspace/config/image-model.json`，和其他本地凭证一样不会提交到仓库。当前默认不配置图片 provider，因此不会生成图片资产或图片审批队列。

配置 OpenAI-compatible 图片 provider 后，TrendForge 会执行真实生图请求：优先调用 `/v1/responses` 的 `image_generation` tool；如果模型服务提示该模型只支持 `/v1/images/generations`，会自动 fallback 到 `/v1/images/generations`。生成文件默认保存到 `workspace/runs/<runId>/assets/`，并可通过 API 单图重生成。

后续接入图片 provider 时，应保持以下默认平台规格：

- 微信公众号：16:9 封面图和 16:9 正文配图。
- 小红书：3:4 竖版封面卡和 3:4 图文卡。

本地测试时不要把 API key 写进仓库文档或 tracked 文件；使用 Web 配置页、`workspace/config/image-model.json` 或 `TRENDFORGE_IMAGE_API_KEY` 环境变量即可。

微信公众号真实上传使用微信官方 API 链路：`GET /cgi-bin/token` 获取 access token，`POST /cgi-bin/material/add_material` 上传封面永久素材，`POST /cgi-bin/media/uploadimg` 转存正文图片，最后 `POST /cgi-bin/draft/add` 创建草稿。TrendForge 可直接保存 AppID/AppSecret，也兼容 legacy 凭据脚本读取方式；只保存 AppID 时，联通与上传 gate 会保持 blocked。

## 长任务进度

热点分析、草稿生成和平台推进都会写入 run events，并由 Web 轮询展示。当前进度计算按任务阶段切片：

- 热点分析只看本次 `screen` 运行事件。
- 草稿生成只看 `draft_generation` 之后的事件。
- 平台推进只看 `platform_publish` 之后的事件。

草稿生成还会写入 `compose_media` 的 `started`、`draft_started`、`draft_finished` 和 `finished` 事件，便于页面显示当前阶段、已处理数量和耗时。原文太短等热点分析阶段提醒只应在候选生成阶段出现，不应在草稿生成阶段重复显示。

## 安全提醒

不要提交 API key、app secret、cookie、token、浏览器 profile、账号截图或真实平台会话文件。`workspace/config/*` 已忽略提交，API 响应只返回 masked secret preview。
