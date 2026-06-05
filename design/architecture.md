# TrendForge 架构说明

## 目标

把内容生产和平台发布拆开，形成一条稳定主线：

`热点采集 -> 原文验证 -> 选材打分 -> 平台改写 -> 图片/排版 -> 发布适配器`

## 分层

### 1. 采集层

负责从这些来源进入候选池：

- AI 热点 API
- 用户接入的额外信息源
- RSS 订阅
- RSSHub 路由输出
- BrowserAct 浏览器补采
- MediaCrawler 备用采集
- 其他手动导入源

默认优先级是：RSSHub -> BrowserAct -> MediaCrawler。MediaCrawler 只在用户明确启用、目标平台需要、前两层无法满足时作为备用选择。

### 2. 验证层

负责做两件事：

- 判断信息是否可靠
- 拉取完整原文或给出失败原因

验证层优先使用普通 HTTP/RSS 内容，其次使用 BrowserAct 打开页面核验；如果目标是中文自媒体平台且 BrowserAct 无法稳定拿到候选内容，可以触发 MediaCrawler 备用采集。

### 3. 选材层

负责从候选池里挑选适合当前目标的一部分内容，并输出：

- 入选理由
- 优先级
- 平台目标
- 传播角度

### 4. 生成层

负责生成不同版本的成稿：

- 公众号版
- 小红书版
- 内部审阅版

### 5. 媒体层

负责图片生成、封面策略和排版策略。

### 6. 发布适配器层

把成稿送到具体平台。

- 公众号适配器：API 草稿发布
- 小红书适配器：浏览器草稿保存

## 现有工作流如何接入

### 公众号工作流

它已经提供了这些契约：

- `article-brief.schema.json`
- `config.example.json`
- `compose-and-publish.js`
- `render-wechat-preview.js`
- `wechat-final.js`
- `chat-publish-template.md`

在 TrendForge 里，它承担“公众号发布适配器”的角色。

### 小红书工作流

它已经提供了这些契约：

- `check-login`
- `fill-publish`
- `save-draft`
- bridge server
- Chrome 扩展

在 TrendForge 里，它承担“浏览器草稿适配器”的角色。

## 状态与追踪

每条内容都应该记录：

- 来源
- 使用的采集适配器
- 原文地址
- 验证状态
- 合规检查状态
- 是否入选
- 生成了哪个平台版本
- 是否发布成功
- 发布返回结果

## 第一阶段边界

先只做：

- 本地工作台
- 单人单账号
- 内容生产主线
- 发布适配器预留
- RSSHub、BrowserAct、MediaCrawler 三类采集适配器设计

暂不强行做：

- 多租户权限
- 云端队列
- 多账号统一后台
- 大规模爬取
- 绕过平台访问限制
