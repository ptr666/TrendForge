# 维护手册

## 日常检查

修改 adapter 或发布相关行为前运行：

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run web:build
npm.cmd test
```

然后检查：

```powershell
git status --short
git submodule status
```

## Adapter 安全规则

- RSSHub 可以拉取公开 RSS feeds。
- BrowserAct 应先规划浏览器动作，再执行真实动作。
- MediaCrawler 默认禁用，使用前需要合规判断。
- 发布默认保持 dry-run，除非用户显式开启。
- 微信公众号真实草稿创建需要 `allowRealDraft=true`、有效凭证、IP 白名单/token 就绪，以及 `coverMediaId`。
- 小红书真实浏览器草稿保存需要 `allowRealDraft=true`、已配置 `xiaohongshu-skills`、bridge/extension/login 就绪，以及页面级草稿已保存信号。
- 图片预览和单图重生成在草稿页完成；review queue 只展示图片生成失败等异常，不承载图片审批流程。
- 成功生成的图片状态应为 `ready`。旧 run 中的 `needs-approval` 只作为兼容状态展示为“已生成”，不再代表审批流程。

## 发布前检查

- TypeScript check 通过。
- 后端 build 通过。
- 测试通过。
- Web build 通过。
- 未暂存 runtime 文件。
- vendor submodule 指向已审阅 commit。
- README 和 docs 反映新的 adapter 行为。

## 失败处理

- Pipeline 失败必须写入 run event。
- 单个 source 采集失败不应阻塞无关 source item。
- 发布失败不得修改 source item 或其他平台草稿。
- 真实外部副作用必须放在显式 flag 或 UI 确认之后。
- 小红书成功不能只看命令退出码，必须有页面级证据。
- 如果 review queue 状态异常，先检查 saved run 的 errors、publishResults 和 blocked assets，并通过 public API 路径重建；不要直接手工编辑存储 JSON。

## 生成慢排查

优先读取最近 run 的事件，而不是只看 API/Web 日志：

```text
workspace/runs/<runId>.events.jsonl
workspace/runs/<runId>.json
workspace/api.err.log
workspace/api.log
```

阶段判断：

- `score` 间隔长：文本模型评分慢。当前评分阶段已做有界并发，默认最多 4 个条目并发评分。
- 单条 `score` 或 `summarize` 模型失败：应只影响当前条目。检查 events 中的 `score_failed`、`summary_fallback`、`screen_item_skipped` 和 `candidate_backfill`，确认系统是否继续补足候选。
- `fetch_full_text` 间隔长：原文站点慢、反爬、网络超时或 BrowserAct fallback 慢。
- `summarize` 间隔长：文本模型总结慢。
- `compose_media` 间隔长：图片模型慢。当前同一草稿的封面图和正文配图会并发生成；不同草稿仍按草稿顺序推进，便于事件和失败隔离。
- `publish` 间隔长：微信 token、封面素材上传、正文图上传或 `draft/add` 慢。最近真实微信上传约 8 到 10 秒/篇。

不要直接删除 `workspace/runs/` 来“提速”。运行历史是诊断证据，清理前需要用户确认。
