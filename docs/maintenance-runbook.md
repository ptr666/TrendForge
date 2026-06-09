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
