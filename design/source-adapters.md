# 采集适配器策略

## Summary

TrendForge 将“简略信息采集”和“完整原文补全”拆开：

1. AIHot skill 负责 AI 热点信息的最高优先级采集。
2. AIHot RSS 是同源 fallback，优先级高于通用 RSS/RSSHub。
3. RSS/RSSHub 负责常规订阅。
4. BrowserAct 负责入选后的疑难网页、动态网页和完整原文补全。
5. MediaCrawler 是原文补全 fallback，只在显式启用且合规的场景触发。

## AIHot

定位：AI 信息源最高优先级入口。

来源：

- Skill / Agent 接入页：`https://aihot.virxact.com/aihot-skill/`
- RSS：由 AIHot 提供的 RSS 能力进入。
- REST API：作为后续可选接入方式。

行为约定：

- 默认使用 AIHot skill 的精选信息流。
- 用户明确要求“日报”时使用 daily 信息。
- 用户明确要求“全部”或“全量”时使用 all 信息。
- skill 接入不可用但 RSS 可用时，使用 AIHot RSS 作为同源 fallback。
- AIHot RSS 优先级高于普通 RSSHub 订阅，因为它仍属于 AIHot 信息源。

输出：

- 标准化 `SourceItem`。
- 来源 URL。
- 发布时间或榜单时间。
- 摘要、正文片段或热点描述。
- AIHot 接入方式元数据：`skill`、`rss` 或 `api`。

## RSS/RSSHub

定位：通用 RSS/RSSHub 采集入口。

输入：

- RSSHub route URL。
- 用户自建 RSSHub 实例地址。
- 非 AIHot 的 RSS URL。
- 订阅分组、关键词、优先级。

输出：

- 标准化 `SourceItem`。
- 来源 URL。
- 发布时间。
- 摘要或原文片段。

触发条件：

- 用户手动运行订阅源。
- 用户指定主题运行工作流。
- 未来可扩展为定时拉取。

## BrowserAct

定位：浏览器原文补全和验证入口。

输入：

- 目标 URL。
- 抽取目标，例如标题、正文、作者、发布时间。
- 是否允许使用已有浏览器登录态。

输出：

- 完整原文。
- 页面证据 URL。
- 抽取失败原因。
- 需要人工处理的状态。

触发条件：

- RSS/RSSHub 只返回摘要。
- 普通 HTTP 抓取失败。
- 页面需要浏览器渲染。
- 需要人工确认页面真实性。

默认行为：

- 未启用真实 BrowserAct 时，生成 planned command 和 handoff artifact。
- 设置 `TRENDFORGE_ENABLE_BROWSERACT=1` 后，可通过 `FullTextProvider` 执行命令式 BrowserAct extraction。

## MediaCrawler

定位：显式启用的原文补全 fallback。

MediaCrawler 支持中文自媒体平台采集，适合在 RSS/RSSHub 和 BrowserAct 无法满足时补全候选内容。由于开源版存在学习和非商业用途边界，TrendForge 默认不启用。

输入：

- `platform`：如 `xhs`、`dy`、`bili`、`wb`、`zhihu`。
- `type`：如 `search` 或 `detail`。
- 关键词或内容 ID。
- 登录方式和本地运行目录。

输出：

- 平台原始采集结果。
- 标准化 `SourceItem` 或原文补全结果。
- 采集状态和失败原因。

触发条件：

- `enableMediaCrawlerFallback = true`。
- 目标平台属于 MediaCrawler 支持范围。
- RSS/RSSHub 未返回可用内容。
- BrowserAct 补全失败或结果不足。
- 当前运行模式允许非默认 fallback 采集。

安全边界：

- 不做大规模抓取。
- 不绕过平台访问限制。
- 不采集用户未授权的私密内容。
- 不把 MediaCrawler 开源版作为商业生产依赖。
- 采集结果必须标记 `complianceStatus` 和 `collectorAdapter`。

## Fallback Order

AI 信息采集默认顺序：

```text
AIHot skill -> AIHot RSS -> RSS/RSSHub
```

原文补全默认顺序：

```text
BrowserAct -> MediaCrawler
```

失败回退规则：

- AIHot skill 不可用：使用 AIHot RSS。
- AIHot RSS 没有结果：进入 RSS/RSSHub 订阅。
- RSS/RSSHub 只提供摘要或原文不足：入选后进入 BrowserAct 原文补全。
- BrowserAct 无法拿到完整内容：如果允许，进入 MediaCrawler。
- MediaCrawler 失败：记录失败原因，不阻塞其他候选项。

## Adapter Contract

每个采集适配器都应实现同一组能力：

- `healthcheck()`
- `collect(queryOrSource)`
- `normalize(rawResult)`
- `explainFailure(error)`

MediaCrawler 额外需要：

- `checkCompliance(runContext)`
- `checkLocalProject()`
- `buildCommand(request)`
- `parseOutput(outputPath)`
