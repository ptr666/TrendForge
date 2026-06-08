# 外部项目与开源参考

TrendForge 通过 adapter、本地 workflow skill 或 planned command handoff 使用外部项目。较重的第三方代码应作为 Git submodule 放在 `vendor/`，不要复制进 TrendForge packages。

本文也是 TrendForge 当前引用的开源项目和外部工作流的维护清单。仅记录可以公开引用的上游项目、官方 API 或通用能力，不记录本地私有 package 路径。

## BrowserAct

- 路径：`vendor/browser-act-skills`
- 仓库：`https://github.com/browser-act/skills.git`
- 角色：浏览器验证、动态页面处理、原文获取 fallback。
- TrendForge 行为：优先生成命令计划；默认不执行真实浏览器动作。

## RSSHub

- 路径：`vendor/rsshub`
- 仓库：`https://github.com/DIYgod/RSSHub.git`
- 角色：普通 RSS 和 RSSHub route 订阅。
- TrendForge 行为：通过 `packages/sources` 消费 RSS 输出。

## MediaCrawler

- 路径：`vendor/mediacrawler`
- 仓库：`https://github.com/NanmiCoder/MediaCrawler.git`
- 角色：对受支持中文媒体平台进行显式 fallback 采集。
- TrendForge 行为：默认禁用；使用前需要合规判断。

## AIHot

- Skill / Agent 入口：`https://aihot.virxact.com/aihot-skill/`
- 角色：最高优先级 AI 热点信息源。
- 支持接入方式：skill、RSS、REST API。
- TrendForge 行为：优先使用 skill 信息流；AIHot RSS 作为同源 fallback；只有 AIHot 不可用或不相关时，才使用通用 RSSHub。

## 小红书浏览器草稿链路

- 仓库：`https://github.com/autoclaw-cc/xiaohongshu-skills`
- 角色：围绕 Hermes、browser bridge、Chrome 扩展、登录态检查、页面填充、草稿保存和可选发布命令，提供浏览器草稿链路能力。
- TrendForge 行为：默认只规划命令和 dry-run；真实保存小红书草稿必须由用户显式开启，并通过 Hermes、bridge、扩展、登录态和页面级保存信号 gate。

## 微信公众号官方 API

- 官方文档：`https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html`
- 角色：上传封面永久素材、转存正文图片、创建微信公众号草稿。
- TrendForge 行为：默认只生成本地草稿；真实草稿创建必须由用户显式推进，需要有效 AppID、AppSecret、IP 白名单、封面 media ID 或本地封面路径，并通过微信 gate。

## 添加 submodule

推荐命令：

```powershell
git submodule add --depth 1 https://github.com/browser-act/skills.git vendor/browser-act-skills
git submodule add --depth 1 https://github.com/DIYgod/RSSHub.git vendor/rsshub
git submodule add --depth 1 https://github.com/NanmiCoder/MediaCrawler.git vendor/mediacrawler
git submodule status
```

如果 Windows 上本地 Git submodule 命令找不到 Git 的 Unix helper tools，请使用可正常运行 `git submodule` 的 Git 环境，或修复 Git PATH，确保 `usr/bin` 和 `mingw64/libexec/git-core` 可用。

## 更新 submodule

```powershell
git submodule update --remote --depth 1 vendor/browser-act-skills
git submodule update --remote --depth 1 vendor/rsshub
git submodule update --remote --depth 1 vendor/mediacrawler
git status --short
```

审查后，在主仓库提交更新后的 gitlink 指针。
