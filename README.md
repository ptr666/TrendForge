# TrendForge

TrendForge 是一个本地优先的 AI 热点内容生产工作台。当前 Web 工作台第一阶段收敛为 AIHot-only 主链路：

```text
AIHot 日报 -> 选择信息 -> 热点分析 -> 原文获取 -> 中文译文/中文总结/评分
-> 人工勾选候选 -> 生成 review/微信公众号/小红书草稿
-> 平台 handoff -> 运行历史
```

RSS/RSSHub 后端能力仍保留，但前端订阅入口暂时隐藏，先保证 AIHot 到平台草稿的闭环稳定。

## 当前能力

- Web 工作台：中文界面，展示 AIHot 日报、热点分析、候选评审、草稿生成、阻塞提醒、运行历史和配置。
- 原文获取：默认使用 HTTP 从候选原文链接抓取正文并保存 Markdown；BrowserAct 只在显式启用时作为 fallback；MediaCrawler 仍需显式开启。
- 中文译文与总结：真实中文翻译和总结依赖 OpenAI-compatible 文本模型；本地可通过 `workspace/config/model.json` 或环境变量启用，密钥文件不会提交到仓库。未启用模型时只生成本地确定性中文占位，不假装完成翻译。
- 产物阅读器：原文 Markdown、草稿 Markdown 和 publisher handoff 会在页面内以可读预览打开。Markdown 预览默认隐藏 frontmatter；JSON handoff 默认显示工作流、平台、草稿正文和计划命令，原始 Markdown/JSON 仅作为折叠调试信息。
- 草稿生成：支持 review、微信公众号、小红书三类草稿；配置图片模型后会同步生成平台封面和内容配图。
- 图片策略：图片生成模型需要单独配置。未配置图片 provider 时，不生成图片资产、不进入图片审批队列；配置 OpenAI-compatible 图片 provider 后，会优先按 Responses `image_generation` 调用真实生图，模型不支持时 fallback 到 `/v1/images/generations`，生成图片保存到 `workspace/runs/<runId>/assets/`，并支持单张图片重生成。
- 平台交接：本地草稿生成与平台草稿推进已拆分。默认只生成 review/微信公众号/小红书本地图文草稿；用户审阅后再显式推进 publisher handoff 或真实平台草稿。微信公众号真实上传使用微信官方 API：优先使用草稿关联的生成封面图上传为永久素材，正文配图会通过 `/cgi-bin/media/uploadimg` 转存后再调用 `/cgi-bin/draft/add` 创建草稿；小红书 handoff 会写入本地图片路径供浏览器工作流上传。
- 运行历史：支持查看 runsDir、恢复 run、打开产物、删除单条和清空全部。

## 最新验证状态

2026-06-09 已完成一次真实链路验证：AIHot 热点分析生成 3 条候选，选取 1 条候选生成微信公众号图文草稿，图片模型生成 1 张 16:9 封面图和 1 张 16:9 正文配图，随后通过微信官方 API 成功创建公众号草稿箱草稿。验证过程中没有记录真实密钥或 access token 到仓库文档；publisher handoff 也未包含 `access_token`。

图片生成接口现在带有单次请求超时保护。若图片模型长时间不返回，单张图片会被标记为失败或待处理，不应阻断文字草稿、已有图片和平台 handoff 的保存。

## 快速开始

```powershell
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

Windows 一键启动：

```powershell
.\start-trendforge.bat
```

启动后访问：

- API: `http://127.0.0.1:4780`
- Web: `http://127.0.0.1:5173/`

停止服务：

```powershell
.\stop-trendforge.bat
```

## 模型配置

可在 Web 工作台“配置”区设置 OpenAI-compatible provider，也可使用环境变量：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"

$env:TRENDFORGE_IMAGE_PROVIDER = "openai-compatible"
$env:TRENDFORGE_IMAGE_BASE_URL = "https://api.example.com/v1"
$env:TRENDFORGE_IMAGE_API_KEY = "<image-api-key>"
$env:TRENDFORGE_IMAGE_MODEL = "gpt-image-1"
```

不要提交 API key、app secret、cookie、token、浏览器 profile 或账号截图。微信 AppSecret 可保存在忽略提交的 `workspace/config/wechat.json`，也可通过环境变量 `WECHAT_APPID`、`WECHAT_APPSECRET` 或 legacy 凭据脚本路径读取；API 和 Web 只返回 masked preview。

## 主要 API

- `GET /health`：返回 API 状态和当前 `runsDir`。
- `GET /sources/aihot/latest`：读取 AIHot 固定源最新信息。
- `POST /pipeline/screen`：对选中的 AIHot 条目做热点分析、原文获取、中文译文/总结和候选评审。
- `POST /pipeline/drafts`：对勾选候选生成本地 review/wechat/xhs 草稿。
- `POST /pipeline/publish-drafts`：从已生成平台草稿推进 publisher handoff 或真实草稿 gate。
- `GET /runs/:runId/assets/:assetId/file`：读取 run 内登记过的图片资产。
- `POST /runs/:runId/assets/:assetId/regenerate`：只重生成指定图片资产。
- `GET /runs`：返回运行历史和当前 `runsDir`。
- `GET /artifacts?path=<runsDir 内路径>`：读取原文 Markdown、草稿 Markdown 或 publisher handoff。
- `GET /publishers`：查看 WeChat/XHS gate 状态。
- `POST /verify/model`、`POST /verify/wechat`、`POST /verify/xhs`：配置验证。

## 文档

- [文档索引](docs/README.md)
- [完整使用流程](docs/usage-flow.md)
- [本地环境](docs/local-setup.md)
- [开发流程](docs/development.md)
- [项目进度](docs/project-progress.md)
- [外部项目与开源参考](docs/vendor-projects.md)
- [Git 工作流](docs/git-workflow.md)
- [维护手册](docs/maintenance-runbook.md)

## 开源参考

TrendForge 通过 adapter、本地 skill 或 planned command handoff 参考和集成以下项目：

- [RSSHub](https://github.com/DIYgod/RSSHub)
- [BrowserAct skills](https://github.com/browser-act/skills)
- [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)
- [autoclaw-cc/xiaohongshu-skills](https://github.com/autoclaw-cc/xiaohongshu-skills)
- [AIHot skill](https://aihot.virxact.com/aihot-skill/)
