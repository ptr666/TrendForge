# 采集适配器策略

## Summary

TrendForge 第一版采用三层采集策略：

1. RSSHub 负责常规订阅。
2. BrowserAct 负责疑难网页、登录网页、动态网页和完整原文补采。
3. MediaCrawler 作为自动备用采集器，只在明确启用且合规的场景下触发。

## RSSHub

定位：默认采集入口。

输入：

- RSSHub route URL
- 用户自建 RSSHub 实例地址
- 订阅分组、关键词、优先级

输出：

- 标准化 `SourceItem`
- 来源 URL
- 发布时间
- 摘要或原文片段

触发条件：

- 定时拉取
- 用户手动刷新
- 指定主题运行工作流

## BrowserAct

定位：浏览器补采和验证入口。

输入：

- 目标 URL
- 抽取目标，例如标题、正文、作者、发布时间
- 是否允许使用已有浏览器登录态

输出：

- 完整原文
- 页面证据 URL
- 抽取失败原因
- 需要人工处理的状态

触发条件：

- RSSHub 只返回摘要
- 普通 HTTP 抓取失败
- 页面需要浏览器渲染
- 需要人工确认页面真实性

## MediaCrawler

定位：自动备用采集器。

它支持中文自媒体平台采集，适合在 RSSHub 和 BrowserAct 无法满足时补充候选内容。由于开源版限制学习和非商业用途，TrendForge 默认不启用。

输入：

- `platform`：如 `xhs`、`dy`、`bili`、`wb`、`zhihu`
- `type`：如 `search` 或 `detail`
- 关键词或内容 ID
- 登录方式和本地运行目录

输出：

- 平台原始采集结果
- 标准化 `SourceItem`
- 采集状态和失败原因

触发条件：

- `enableMediaCrawlerFallback = true`
- 目标平台属于 MediaCrawler 支持范围
- RSSHub 未返回可用内容
- BrowserAct 补采失败或结果不足
- 当前运行模式允许非默认备用采集

安全边界：

- 不做大规模爬取。
- 不绕过平台访问限制。
- 不采集用户未授权的私密内容。
- 不把 MediaCrawler 开源版作为商业生产依赖。
- 采集结果必须标记 `complianceStatus` 和 `collectorAdapter`。

## Fallback Order

默认顺序：

```text
RSSHub -> BrowserAct -> MediaCrawler
```

失败回退规则：

- RSSHub 没有结果：进入 BrowserAct。
- BrowserAct 无法拿到完整内容：如果允许，进入 MediaCrawler。
- MediaCrawler 失败：记录失败原因，不阻塞其他候选项。

## Adapter Contract

每个采集适配器都实现同一组能力：

- `healthcheck()`
- `collect(queryOrSource)`
- `normalize(rawResult)`
- `explainFailure(error)`

MediaCrawler 额外需要：

- `checkCompliance(runContext)`
- `checkLocalProject()`
- `buildCommand(request)`
- `parseOutput(outputPath)`

