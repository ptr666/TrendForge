# TrendForge 完整配置指南

本文说明 TrendForge 当前版本的本地配置方式。所有真实密钥、AppSecret、token、cookie、浏览器登录态和运行产物都应保存在 `workspace/` 或环境变量中，不要写入仓库文档或提交到 Git。

## 1. 基础环境

要求：

- Node.js 20 或更高版本。
- npm。
- Git。
- Windows 本地运行推荐 PowerShell 或双击 `.bat` 脚本。

首次安装：

```powershell
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

一键启动：

```powershell
.\start-trendforge.bat
```

默认地址：

- API: `http://127.0.0.1:4780`
- Web: `http://127.0.0.1:5173/`

停止：

```powershell
.\stop-trendforge.bat
```

运行日志：

- `workspace/api.log`
- `workspace/api.err.log`
- `workspace/web.log`
- `workspace/web.err.log`

运行历史默认目录是 `workspace/runs/`。如需覆盖：

```powershell
$env:TRENDFORGE_RUNS_DIR = "D:\TrendForgeRuns"
```

Web“运行历史”会显示当前 `runsDir`，用于确认是否启动到了同一个历史目录。

## 2. Web 配置区

当前 Web 工作台的“配置”区可设置：

- 文本模型：OpenAI-compatible API。
- 图片模型：OpenAI-compatible 图片生成 API。
- 微信公众号：AppID、AppSecret、本地封面路径或 legacy 凭据脚本。
- 小红书：Hermes/bridge/Chrome extension 工作流参数。

配置会写入 `workspace/config/*.json`。这些文件已被 `.gitignore` 忽略，适合保存本地密钥；但仍建议不要在截图、日志或 issue 中暴露明文 secret。

## 3. 文本模型配置

用途：

- 热点筛选评分理由。
- 中文原文翻译。
- 中文总结。
- 平台化草稿标题、正文和角度生成。
- 图片提示词生成。

Web 配置：

1. 打开 `http://127.0.0.1:5173/`。
2. 进入“配置”。
3. 启用文本模型。
4. 填写 OpenAI-compatible base URL、API key、模型名。
5. 点击保存并测试模型。

环境变量方式：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.example.com"
$env:TRENDFORGE_MODEL_API_KEY = "<text-api-key>"
$env:TRENDFORGE_MODEL_NAME = "<model-name>"
```

接口约定：

- 后端会把 bare host 或不带 `/v1` 的地址规范化到 OpenAI-compatible chat completions 调用。
- 模型应返回 JSON；若模型返回 HTML、网关错误或非 JSON，页面会显示可读失败原因。
- 未启用真实文本模型时，deterministic provider 只生成可测试占位，不代表最终内容质量，也不会假装完成完整中文翻译。

## 4. 图片模型配置

用途：

- 微信公众号封面图。
- 微信公众号正文配图。
- 小红书 3:4 封面卡。
- 小红书 3:4 图文卡。

默认行为：

- 未配置图片模型时，不申请生图、不生成图片资产、不进入图片审批队列。
- 配置图片模型后，草稿生成阶段会同步规划并生成图片。
- 图片失败不会阻断文字草稿保存；失败图片会在草稿页显示状态并提供单图重生成。

环境变量方式：

```powershell
$env:TRENDFORGE_IMAGE_PROVIDER = "openai-compatible"
$env:TRENDFORGE_IMAGE_BASE_URL = "https://api.example.com/v1"
$env:TRENDFORGE_IMAGE_API_KEY = "<image-api-key>"
$env:TRENDFORGE_IMAGE_MODEL = "<image-model-name>"
```

调用顺序：

1. 优先调用 `/v1/responses`，使用 `image_generation` tool。
2. 如果模型服务提示该模型只支持图片生成端点，则 fallback 到 `/v1/images/generations`。
3. 单次图片请求有超时保护，避免草稿生成无限等待。

文件位置：

```text
workspace/runs/<runId>/assets/
```

图片 ID 稳定命名为：

```text
tf-<runId>-<sourceSlug>-<platform>-<role>-<index>-r<revision>
```

Web 草稿页支持：

- 图片缩略图预览。
- prompt 查看。
- 状态和失败原因查看。
- 单张图片重生成。
- 微信图文预览和小红书手机卡片预览。

## 5. 微信公众号配置

用途：

- 检查公众号 API gate。
- 上传封面永久素材。
- 上传正文图片到微信图床。
- 调用微信官方 `draft/add` 创建草稿箱草稿。

Web 配置：

1. 进入“配置”。
2. 启用微信公众号。
3. 填写 AppID。
4. 填写 AppSecret，或配置 legacy 凭据脚本。
5. 可选填写本地封面路径；若草稿已有生成封面图，会优先使用草稿关联封面图。
6. 点击“检查微信联通与上传 gate”。

环境变量方式：

```powershell
$env:WECHAT_APPID = "<wechat-appid>"
$env:WECHAT_APPSECRET = "<wechat-appsecret>"
```

真实草稿创建要求：

- AppID 和 AppSecret 均有效。
- 当前服务器 IP 已在微信公众平台白名单中。
- 可获取 access token。
- 有可用封面图：优先使用生成的草稿封面 asset，其次使用配置的 `coverMediaId` 或本地封面路径。
- 用户在 Web 中显式勾选真实草稿推进，并通过二次确认。

执行链路：

```text
GET /cgi-bin/token
-> POST /cgi-bin/material/add_material
-> POST /cgi-bin/media/uploadimg
-> POST /cgi-bin/draft/add
```

安全约定：

- API 和 Web 只返回 masked preview，不展示 AppSecret 或 access token。
- publisher handoff 不应包含 access token 或 AppSecret。
- 正式发布动作仍禁用；当前只创建草稿箱草稿。

## 6. 小红书配置

用途：

- 生成小红书图文笔记草稿内容。
- 生成包含图片路径、标题、正文、标签和 planned command 的 handoff。
- 真实保存仍依赖 Hermes/bridge/Chrome extension 和页面级保存信号。

Web 配置：

1. 进入“配置”。
2. 启用小红书。
3. 填写本地工作流目录和 bridge URL。
4. 点击小红书 gate 检查。

默认路径示例：

```text
vendor/xiaohongshu-skills
ws://localhost:9343
```

真实保存要求：

- Hermes/bridge 可连接。
- Chrome extension 已就绪。
- 浏览器登录态有效。
- 页面返回明确的草稿保存成功信号，不能只看命令退出码。

TrendForge 当前主要负责生成 XHS handoff：

- `coverPath`
- `contentImagePaths`
- `imagePaths`
- `imagePrompts`
- `plannedCommands`

## 7. 原文获取配置

默认链路：

```text
HTTP 原文抓取 -> BrowserAct fallback（显式启用） -> MediaCrawler fallback（显式启用）
```

HTTP 原文抓取默认启用。入选候选有 HTTP URL 时，系统会尝试抓取 HTML、Markdown 或 plain text，抽取正文并保存到：

```text
workspace/runs/<runId>/full-text/
```

BrowserAct fallback：

```powershell
$env:TRENDFORGE_ENABLE_BROWSERACT = "1"
$env:TRENDFORGE_BROWSERACT_COMMAND = "browser-act"
```

MediaCrawler fallback 当前只在显式允许时作为 planned fallback，不作为默认订阅源。

如果某条原文抓取失败，例如正文太短，系统会在热点分析阶段把该信息记为 0 分并继续选择其他候选；该提醒只应在候选生成/热点分析阶段出现，不应在草稿生成阶段重复污染进度面板。

## 8. AIHot 与 RSS/RSSHub

当前 Web 第一阶段只开放 AIHot 固定源：

```text
AIHot 日报 -> 选择条目 -> 热点分析 -> 候选评审 -> 草稿生成 -> 平台推进
```

RSS/RSSHub 后端 adapter 和 API 仍保留，但前端入口暂时隐藏。恢复 RSS/RSSHub 前端入口时必须采用：

```text
预览/验证 -> 保存渠道库 -> 本次筛选选择
```

不要把“添加订阅”和“本次筛选使用来源”重新耦合。

## 9. 长任务进度和运行历史

热点分析、草稿生成和平台推进都以 async run 执行，并通过：

```http
GET /runs/:runId/events
```

轮询进度。

当前进度计算按任务阶段切片：

- 热点分析只看 `started(mode=screen)` 之后的 events。
- 草稿生成只看 `draft_generation` 之后的 events。
- 平台推进只看 `platform_publish` 之后的 events。

这样可以避免热点分析阶段的原文失败提醒在草稿生成阶段重复显示。

草稿生成会写入 `compose_media` 进度事件：

- `started`
- `draft_started`
- `draft_finished`
- `finished`

Web 会展示当前阶段、已处理数量和耗时。如果草稿生成卡住，优先查看：

- `workspace/api.log`
- `workspace/api.err.log`
- `GET /runs/:runId/events`
- 图片模型是否超时或返回非预期响应。

## 10. 常见排障

### 模型测试返回 HTML

现象：

```text
Unexpected token '<', "<!doctype "... is not valid JSON
```

通常表示 base URL 指向了网页、反代首页或错误路径。检查：

- base URL 是否为 OpenAI-compatible API 地址。
- 是否需要 `/v1`。
- API key 是否适用于当前服务。
- 反代是否把 API 请求重定向到了 HTML 页面。

### 原文正文太短

现象：

```text
HTTP 原文获取失败：抽取出的正文太短
```

当前处理方式：

- 该信息在热点分析阶段记为 0 分或跳过。
- pipeline 继续处理其他信息，尽量保证候选数量。
- 提醒不应在草稿生成阶段重复显示。

### 微信上传成功但前端状态不明显

检查：

- `POST /pipeline/publish-drafts` 返回的 `publishResults`。
- run events 中是否有 `Official draft/add response returned media_id.`。
- 草稿卡是否显示“已上传到微信草稿箱”和 media_id。
- publisher handoff 是否存在，且不包含敏感 token。

### 草稿生成看起来卡住

检查：

- 草稿生成进度面板的当前阶段和耗时。
- `compose_media` events 是否持续更新。
- 图片模型接口是否超时。
- `workspace/api.err.log` 是否有 provider 错误。

## 11. 提交前检查

提交前运行：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
git status --short
```

确认不要提交：

- `workspace/config/*`
- `workspace/runs/*`
- `.env`
- API key、AppSecret、access token、cookie、账号截图。

