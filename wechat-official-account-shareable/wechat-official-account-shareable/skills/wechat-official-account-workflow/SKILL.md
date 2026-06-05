---
name: wechat-official-account-workflow
description: "搭建、配置、检查、生成并发布微信公众号文章草稿；覆盖 AppID/AppSecret、IP 白名单、文章骨架、AI 封面图、预览、检查、草稿发布，以及与监控/风格改写技能的协同。"
---

# WeChat Official Account Workflow

用于把 **选题/brief → Markdown → AI 封面图 → 微信公众号草稿** 这条链路完整搭起来，或在现有工作区上继续维护、排障、验证。

## 何时使用

当用户提到这些需求时触发：
- 搭建 / 配置 / 初始化公众号自动发文流程
- 根据 AppID / AppSecret 完整打通公众号草稿发布
- 自动生成公众号文章、封面图并发到草稿箱
- 检查公众号发布链路、修复 token / 白名单 / AI 封面问题
- 把监控 skill、风格改写 skill 接到发布 skill 上

## 工作区与主目录

主工作目录：

`workspace 下的 `wechat-official-account/` 目录`

技能目录：

`当前 skill 目录`

## 先读哪些参考

开始前按需读取：
- 搭建 / 初始化 / 配置指南：
  - `references/setup-and-config.md`
- 日常使用 / 完整功能介绍：
  - `references/usage-and-capabilities.md`
- 排障 / 联调 / 已知坑：
  - `references/troubleshooting.md`

## 这个 skill 负责什么

1. 检查或创建 `wechat-official-account` 工作流目录
2. 指导或代改 `config.json`
3. 确认公众号后台权限、AppID/AppSecret、IP 白名单
4. 生成或更新 article brief / Markdown
5. 运行预览、检查、正式发稿
6. 处理 AI 封面图策略：本地图 / Responses 自然语言生图 / prompt-only / 渐变兜底
7. 需要时对接：
   - `skills/wechat-article-watch`
   - `skills/wechat-style-rewrite`

## 执行原则

- 先做 **preview + check**，再做真实草稿发布
- 涉及外部账号与真实公众号草稿箱时，默认先说明影响
- 优先复用现有脚本，不重新发明流程
- 记录文件与状态优先落在现有目录：`articles/`、`output/`、`state/`

## 核心脚本

优先复用：
- `compose-and-publish.js`
- `render-wechat-preview.js`
- `wechat-final.js`
- `templates/wechat-theme-default.js`
- `article-brief.example.json`
- `article-brief.schema.json`

## 标准工作流

1. 读 `references/setup-and-config.md`，确认账号、权限、白名单、目录结构
2. 检查 `config.json`、`articlePath`、封面策略
3. 如用户从主题/brief 开始：先生成 article brief 或 Markdown
4. 运行：
   - `npm run preview`
   - `npm run check`
5. 通过后再运行：
   - `node wechat-final.js`
   - 或 `node wechat-final.js --force`
6. 发布后检查：
   - `output/article-final.html`
   - `state/published.json`

## 与其他 skill 的边界

- **监控、订阅、扫码登录、缓存文章**：交给 `wechat-article-watch`
- **学习风格、抽取结构、改写成新稿**：交给 `wechat-style-rewrite`
- **本 skill** 专注：生成可发布文章、封面、预览、检查、草稿发布
