# TrendForge 完整使用流程

本文记录当前 Web 工作台的实际操作方式。第一阶段前端只开放 AIHot 固定源；RSS/RSSHub API 和 adapter 仍保留，但订阅入口暂时隐藏。

默认安全策略不变：可以生成本地草稿和平台 handoff，但不会正式发布；真实创建微信公众号或小红书草稿必须显式开启并通过对应 gate。图片生成模型未单独配置时，系统不会申请图片生成，也不会生成图片审批队列。

## 1. 启动项目

```powershell
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd run web:build
npm.cmd test
.\start-trendforge.bat
```

访问：

- API: `http://127.0.0.1:4780`
- Web: `http://127.0.0.1:5173/`

停止：

```powershell
.\stop-trendforge.bat
```

## 2. 配置文本模型和平台 gate

在 Web 工作台“配置”区可以设置：

- OpenAI-compatible 文本模型 provider。
- 微信公众号 App ID、App Secret、封面 media ID、本地封面路径或 legacy 凭据脚本。
- 小红书 Hermes/bridge/Chrome extension 工作流配置。
- 图片生成模型 provider。

中文原文翻译和高质量中文总结依赖真实文本模型。未启用模型时，deterministic provider 只会生成中文占位摘要和原文摘录提示，不会假装完成翻译。

模型也可以通过环境变量配置：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

配置后可使用页面里的“测试模型请求”“检查微信联通与上传 gate”“检查小红书 gate”验证状态。微信 gate 会先请求 `/cgi-bin/token`，成功后检查封面 media ID 或本地封面路径是否就绪；只有用户显式开启真实草稿时才会继续上传封面、正文图片并创建草稿。反馈默认显示可读中文，原始 JSON 只在调试区展开。

微信公众号只输入 AppID 可以保存本地配置，但不能完成上传或创建草稿。真实公众号草稿创建需要 AppID、AppSecret、服务器 IP 白名单通过 token 检查，并提供封面 media ID 或本地封面路径。若填写本地封面路径，后端会使用微信官方 API，先通过 `/cgi-bin/material/add_material` 上传为永久素材并取得 `thumb_media_id`；草稿正文里的远程或本地图片会通过 `/cgi-bin/media/uploadimg` 转存到微信图床，最后调用 `/cgi-bin/draft/add` 创建草稿。

本地真实模型配置可以保存在 `workspace/config/model.json`，微信配置可以保存在 `workspace/config/wechat.json`，这些文件都被 `.gitignore` 忽略，适合保存 API key 和 AppSecret。微信配置也兼容 legacy 凭据脚本读取方式。提交代码或文档时不要把真实 key 或 secret 写入仓库。

## 3. 阅读 AIHot 日报

打开工作台后进入“AIHot 日报”：

1. 页面自动请求 `GET /sources/aihot/latest`。
2. 顶部展示 AIHot 健康状态、抓取数量、已选择数量和更新时间。
3. 左侧“今日日报全文”按文章视图展示，可滚动完整阅读。
4. 右侧条目卡支持逐条勾选、全选、取消全选。
5. 每条有来源链接时可直接打开原文链接。

如果 AIHot 获取失败，页面会展示失败原因和重试建议；当前前端不会展示 RSS/RSSHub 作为替代入口。

## 4. 热点分析

进入“热点分析”：

1. 设置最终候选数量。
2. 确认已选择的 AIHot 条目数量。
3. 按需允许 BrowserAct fallback 或 MediaCrawler fallback。
4. 点击“分析选中内容”。

前端调用：

```http
POST /pipeline/screen
```

示例：

```json
{
  "runId": "screen-demo",
  "sourceIds": ["aihot-default"],
  "sourceItemIds": ["aihot-item-id-1", "aihot-item-id-2"],
  "candidateCount": 3,
  "allowBrowserFallback": true,
  "allowMediaCrawlerFallback": false
}
```

`sourceItemIds` 会真实限制本次分析范围。未被选择的 AIHot 条目不会进入校验、评分、原文获取和总结。

## 5. 原文获取

当前默认链路：

```text
HTTP 原文抓取 -> BrowserAct fallback（显式启用） -> MediaCrawler fallback（显式启用）
```

- HTTP 抓取会从候选 URL 拉取 HTML/Markdown/plain text，清理后保存为 Markdown。
- BrowserAct 未启用时不会伪装执行，也不会把 `Original text acquisition planned for BrowserAct.` 显示为用户风险提示。
- MediaCrawler 只在用户显式开启 fallback 时留下 planned event。
- 失败原因写入 run events 和候选原文状态。

原文 Markdown 默认保存到：

```text
workspace/runs/<runId>/full-text/
```

如果设置了 `TRENDFORGE_RUNS_DIR`，则保存到对应 runsDir 下。

## 6. 候选评审

热点分析完成后进入“候选评审”。每张候选卡展示：

- 标题和来源链接。
- 原文获取状态和获取方式。
- 评分和评分条。
- 入选原因与内容角度。
- 中文总结和关键点。
- 中文译文：真实模型返回 `translatedOriginal` 时展示译文；未配置真实模型时显示“未生成中文译文”的说明。
- 风险提示。
- “打开原文 Markdown”按钮。

点击原文或草稿按钮会在当前页面打开产物阅读器。阅读器默认渲染 Markdown 预览，并隐藏顶部 frontmatter；原始 Markdown 只在折叠区保留。

## 7. 生成本地草稿

进入“草稿生成”：

1. 勾选需要进入草稿阶段的候选。
2. 选择平台：`review`、`wechat`、`xhs`。
3. 点击“生成图文草稿”。

前端调用：

```http
POST /pipeline/drafts
```

示例：

```json
{
  "runId": "screen-demo",
  "sourceItemIds": ["aihot-item-id-1"],
  "requestedPlatforms": ["review", "wechat", "xhs"]
}
```

产物默认保存到：

- `workspace/runs/<runId>/drafts/`
- `workspace/runs/<runId>/full-text/`

草稿页会展示 Markdown 渲染预览、微信文章图文预览、小红书手机图文预览和图片资产栏。这一步只生成本地 review/wechat/xhs 草稿和本地图片，不创建 publisher handoff，也不会上传到微信或小红书。

如果已配置图片生成模型，每个候选默认生成：

- 微信公众号：1 张 16:9 封面图、1 张正文配图。
- 小红书：1 张 3:4 竖版封面卡、1 张 3:4 图文卡。

每张图片都有独立 ID、版本号、提示词和“重新生成这张图”按钮。重生成只影响当前图片，不会重写其他图片或文字草稿。

## 8. 推进平台草稿

用户审阅本地草稿后，可以在“草稿生成”区域继续推进平台草稿：

1. 确认已生成 wechat 或 xhs 本地草稿。
2. 默认保持 dry-run，只生成 publisher handoff。
3. 如需真实创建平台草稿，勾选“推进真实平台草稿”，并在二次确认后执行。
4. 点击“推进平台草稿”。

前端调用：

```http
POST /pipeline/publish-drafts
```

示例：

```json
{
  "runId": "screen-demo",
  "sourceItemIds": ["aihot-item-id-1"],
  "requestedPlatforms": ["wechat", "xhs"],
  "allowRealDraft": false
}
```

publisher handoff 默认保存到：

- `workspace/runs/<runId>/publisher-handoffs/`

publisher handoff 是 JSON 产物。页面会用专门的 handoff 预览展示工作流、平台、草稿标题、正文预览、计划命令和验证信号；完整 JSON 只在“查看原始 JSON”或“查看格式化 JSON”中展开。

## 9. 图片生成策略

图片生成模型与文本模型分开配置。当前默认行为是：

- 未配置图片 provider：不生成图片资产、不生成图片 prompt、不进入图片审批队列。
- 显式接入 OpenAI-compatible 图片 provider 后：微信公众号默认生成 16:9 封面和正文配图，小红书默认生成 3:4 封面卡和图文卡，图片文件保存到 `workspace/runs/<runId>/assets/`，并进入草稿页预览。

这避免在只配置文本模型时误触发图片生成申请，也符合微信和小红书工作流里图片处理需要单独 gate 的要求。

图片 provider 的调用顺序参考微信公众号工作流的生图实现：先调用 `/v1/responses` 并传入 `tools: [{ type: "image_generation" }]`；如果模型服务提示该图片模型只支持 `/v1/images/generations`，则自动 fallback 到 `/v1/images/generations`。本地验证使用过 `gpt-image-2`，该模型走 fallback 路径可以生成真实图片。

每次图片请求都有超时保护。图片模型卡住或长时间不返回时，该图片应被记录为失败或待处理资产，文字草稿、已生成图片和 publisher handoff 仍应继续保存。这样可以避免单张图片阻塞整个草稿生成流程。

注意：生成图片和上传到平台仍是两个阶段。TrendForge 会先生成并保存图片资产；微信公众号真实草稿上传时会优先使用当前草稿关联的生成封面图，并把正文配图转存到微信图床；小红书 handoff 会写入 `imagePaths`、`coverPath`、`contentImagePaths` 和图片提示词。

### 9.1 已验证的微信草稿箱链路

2026-06-09 本地已验证一次真实微信公众号草稿箱链路：

- AIHot 热点分析生成 3 条候选。
- 选取 1 条候选生成 1 份微信公众号草稿。
- 图片模型生成 1 张微信封面图和 1 张微信正文配图，均保存到 `workspace/runs/<runId>/assets/`。
- `POST /pipeline/publish-drafts` 在 `allowRealDraft=true` 时通过微信 gate，并调用官方 API 创建草稿箱草稿。
- run events 中成功信号为 `Official draft/add response returned media_id.`。
- publisher handoff 保存到 `workspace/runs/<runId>/publisher-handoffs/`，不应包含 access token 或 AppSecret。

当前仍需优化的交互细节：如果真实微信草稿已经创建成功，图片资产提醒应从“阻塞”语义降级为“事后审核/可重生成”，避免用户误以为上传失败。

## 10. 阻塞与提醒

“阻塞与提醒”不是主流程入口，只展示需要处理的问题：

- 原文缺失或原文获取失败。
- 微信公众号或小红书 gate 阻塞。
- publisher handoff 缺失或失败。
- pipeline 运行级错误。

默认无图片 provider 时，不会出现图片审批提醒。

## 11. 运行历史

“运行历史”支持：

- 查看当前 `runsDir`、历史数量和更新时间。
- 恢复历史 run。
- 打开原文 Markdown、草稿 Markdown、publisher handoff。
- 删除单条历史。
- 清空全部历史。

对应 API：

- `GET /runs`
- `DELETE /runs`
- `GET /runs/:runId`
- `DELETE /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /artifacts?path=<runsDir 内路径>`

启动脚本不会清空 runs。若历史看起来丢失，优先检查页面显示的 `runsDir` 是否与之前运行时一致。

## 12. RSS/RSSHub 当前状态

RSS/RSSHub 后端能力仍保留，包括订阅 CRUD、preview、healthcheck 和 RSSHub route 规范化。但当前 Web 工作台前端不显示订阅添加入口，也不会把 RSS/RSSHub 作为筛选来源。

恢复前端入口时，必须继续使用“预览/验证 -> 保存渠道 -> 本次筛选选择”的两段式流程。

## 13. 中文编码规则

此前前端和文档曾出现 mojibake。后续中文编辑必须使用安全写入方式，优先 `apply_patch`，避免未声明编码的 shell 重定向。

文档或 UI 文案变更后运行：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```
