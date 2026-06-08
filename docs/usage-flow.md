# TrendForge 完整使用流程

本文描述当前 Web 工作台的实际使用方式。第一阶段前端只开放 AIHot 固定源，RSS/RSSHub 订阅入口暂时隐藏；后端相关 API 和适配器保留，后续再恢复多来源订阅。

默认安全策略不变：可以生成本地草稿、配图计划和平台 handoff，但正式发布禁用；真实创建平台草稿必须显式开启并通过对应 health gate。

## 1. 启动项目

安装依赖：

```powershell
npm.cmd install --cache .\.npm-cache
```

构建与测试：

```powershell
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

一键启动：

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

## 2. 配置模型和平台 gate

在 Web 工作台“配置”区域可以设置：

- OpenAI-compatible 模型 provider。
- 微信公众号 App ID、App Secret、封面 media ID。
- 小红书 Hermes/bridge/Chrome extension 工作流配置。

模型也可以通过环境变量配置：

```powershell
$env:TRENDFORGE_TEXT_PROVIDER = "openai-compatible"
$env:TRENDFORGE_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TRENDFORGE_MODEL_API_KEY = "<api-key>"
$env:TRENDFORGE_MODEL_NAME = "deepseek-v4-flash"
```

配置后可使用页面里的“测试模型请求”“请求微信 token”“检查小红书 gate”验证状态。反馈默认显示可读中文说明，原始 JSON 只在“查看调试 JSON”中展开。

## 3. 浏览 AIHot 日报

打开 Web 工作台后，进入“AIHot 日报”区域：

1. 页面自动请求 `GET /sources/aihot/latest`。
2. 顶部展示 AIHot 健康状态、抓取数量、已选择数量和更新时间。
3. 左侧“今日日报全文”可滚动阅读完整日报。
4. 右侧条目列表支持逐条勾选。
5. 点击“全选今日 AIHot”可以一次选择全部可见条目。

如果 AIHot 获取失败，页面会显示失败原因和重试建议。当前前端不会展示 RSS/RSSHub 作为替代入口。

## 4. 热点分析

进入“热点分析”区域：

1. 设置最终候选数量。
2. 确认已选择的 AIHot 条目数量。
3. 选择是否允许 BrowserAct 补全原文。
4. 如确实需要，显式开启 MediaCrawler fallback。
5. 点击“分析选中内容”。

前端会调用：

```http
POST /pipeline/screen
```

请求示例：

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

`sourceItemIds` 会真实限制本次分析范围。未被选择的 AIHot 条目不会进入后续校验、评分、原文补全和总结。

## 5. 候选评审

热点分析完成后，进入“候选评审”区域。每张候选卡展示：

- 标题和来源链接。
- 原文获取状态。
- 评分和评分条。
- 入选原因。
- 中文总结和关键点。
- 风险提示。
- 原文 Markdown 产物入口。

用户可以逐条勾选候选，也可以“全选候选”。只有勾选的候选会进入草稿生成。

原文 Markdown 默认保存在：

```text
workspace/runs/<runId>/full-text/
```

BrowserAct planned handoff 默认保存在：

```text
workspace/runs/<runId>/full-text-handoffs/
```

## 6. 生成草稿

进入“草稿生成”区域：

1. 选择平台：`review`、`wechat`、`xhs`。
2. 点击“生成草稿”。
3. 查看各平台草稿标题、正文预览、配图计划和 publisher handoff 状态。
4. 如需排障，展开“查看调试 JSON”。

前端会调用：

```http
POST /pipeline/drafts
```

请求示例：

```json
{
  "runId": "screen-demo",
  "sourceItemIds": ["aihot-item-id-1"],
  "requestedPlatforms": ["review", "wechat", "xhs"],
  "allowRealDraft": false
}
```

产物保存位置：

- `workspace/runs/<runId>/drafts/`
- `workspace/runs/<runId>/publisher-handoffs/`
- `workspace/runs/<runId>/full-text/`
- `workspace/runs/<runId>/full-text-handoffs/`

## 7. 阻塞与提醒

旧的等待队列和人工审核入口已降级为“阻塞与提醒”。它不再是主流程入口，只展示异常和控制点：

- 原文缺失或原文获取失败。
- 图片资产需要审批。
- 微信公众号或小红书 platform gate 阻塞。
- publisher handoff 缺失或失败。
- pipeline 运行级错误。

## 8. 运行历史

“运行历史”支持：

- 查看历史 run。
- 恢复候选、草稿和 artifact 详情。
- 打开原文 Markdown 和草稿 Markdown。
- 删除单条历史。
- 清空全部历史。

对应 API：

- `GET /runs`
- `DELETE /runs`
- `GET /runs/:runId`
- `DELETE /runs/:runId`
- `GET /runs/:runId/events`
- `GET /runs/:runId/review-queue`
- `GET /artifacts?path=<workspace/runs/...>`

## 9. RSS/RSSHub 当前状态

RSS/RSSHub 后端能力仍保留，包括订阅 CRUD、preview、healthcheck 和 RSSHub route 规范化。但当前 Web 工作台前端不显示订阅添加入口，也不会把 RSS/RSSHub 作为筛选来源。

这样做是为了先稳定 AIHot 主链路，避免 RSSHub 公共实例不可达、Cloudflare challenge 或本地代理差异影响核心流程验证。

## 10. 中文乱码记录

本轮修复前，`apps/web/src/main.tsx`、`apps/web/src/components/panels.tsx`、`apps/web/src/components/ui.tsx`、`README.md` 和 `docs/usage-flow.md` 中存在中文乱码。原因是中文字符串曾被错误编码保存或被错误解码后再次写入。

后续编辑中文文档和前端文案时必须注意：

- 优先使用 `apply_patch` 进行文本修改。
- 避免用 shell 重定向或不明确编码的脚本批量写中文。
- 构建前后检查页面和文档中的中文是否可读。
