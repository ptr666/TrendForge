# 搭建与配置指南

这份文档用于让 OpenClaw **从零开始完整搭建微信公众号自动生成文章与图片并发布草稿的工作流**。

## 1. 工作流目标

完整链路：

1. 准备公众号 API 凭证
2. 配置 `wechat-official-account`
3. 准备 article brief 或 Markdown
4. 生成预览 HTML
5. 校验 token / 路径 / 配置
6. 自动生成封面图
7. 上传封面与正文图片到微信
8. 创建公众号草稿
9. 记录最终 HTML 与发布状态

---

## 2. 关键目录

主目录：

`workspace 下的 `wechat-official-account/` 目录`

关键文件：
- `config.example.json`
- `config.json`
- `article-brief.example.json`
- `article-brief.schema.json`
- `compose-and-publish.js`
- `render-wechat-preview.js`
- `wechat-final.js`
- `templates/wechat-theme-default.js`
- `output/article-preview.html`
- `output/article-final.html`
- `state/published.json`

---

## 3. 公众号后台需要准备什么

登录：
- <https://mp.weixin.qq.com>

路径：
- **设置与开发 → 基本配置**

需要：
- AppID
- AppSecret

还需要在公众号后台完成：
- 服务器出口 IP 白名单

### IP 白名单说明
如果没配对，`access_token` 会失败，常见报错：

`errcode: 40164 invalid ip not in whitelist`

因此，OpenClaw 在搭建时应先确认：
- 当前出口 IP 是什么
- 已写入对应公众号后台的 IP 白名单
- 保存已生效

---

## 4. config.json 标准示例

推荐配置：

```json
{
  "appid": "你的 AppID",
  "appsecret": "你的 AppSecret",
  "legacyCredentialSource": "./wechat-publish-v3.js",
  "articlePath": "./articles/你的文章.md",
  "author": "QClaw 运营助手",
  "digest": "这里写文章摘要",
  "contentSourceUrl": "",
  "cover": {
    "width": 1280,
    "height": 720,
    "imagePath": "",
    "prompt": "",
    "ai": {
      "mode": "generate",
      "baseUrl": "https://your-openai-compatible-api.example.com/v1",
      "model": "gpt-image-2",
      "apiKey": "你的生图 API Key"
    }
  },
  "comment": {
    "needOpenComment": true,
    "onlyFansCanComment": false
  }
}
```

也支持环境变量覆盖：

```bash
export WECHAT_APPID='你的 AppID'
export WECHAT_APPSECRET='你的 AppSecret'
export COVER_AI_MODE='generate'
```

---

## 5. 封面图策略

### 模式 A：本地封面图优先
当：
- `frontmatter cover` 存在
- 或 `cover.imagePath` 指向有效文件

脚本直接上传本地图到微信永久素材库。

### 模式 B：Responses 自然语言生图
当：
- 没有本地图
- `cover.ai.mode = "generate"`

脚本当前走的是**实测可用**链路：
- endpoint：`/v1/responses`
- model：`gpt-5.4`
- tools：`[{ type: "image_generation" }]`
- 输入：自然语言封面描述

发布记录中的 `coverSource` 会记成：
- `ai:responses:gpt-5.4:image_generation`

### 模式 C：只产出提示词
当：
- `cover.ai.mode = "prompt-only"`

脚本只输出：
- `output/cover-prompt.txt`

不直接请求生图接口。

### 模式 D：渐变兜底图
当 AI 生图失败时，自动生成本地 PNG 渐变封面，保证主链路不断。

---

## 6. 文章输入方式

### 方式 1：直接给 Markdown
放入：
- `articles/*.md`

推荐 frontmatter：

```md
---
title: 文章标题
author: QClaw 运营助手
digest: 这里写摘要
cover: ./covers/你的封面图.png
source_url: ""
---

# 文章标题
```

### 方式 2：先给 article brief
使用：
- `article-brief.example.json`
- `compose-and-publish.js`

brief 生成成稿后，会自动写到 `articles/` 并更新 `config.json`。

---

## 7. 标准搭建顺序

### 第一步：确认目录与依赖
在：
- `workspace 下的 `wechat-official-account/` 目录`

检查这些文件是否存在：
- `package.json`
- `wechat-final.js`
- `render-wechat-preview.js`
- `compose-and-publish.js`
- `templates/wechat-theme-default.js`

### 第二步：准备 config.json
从：
- `config.example.json`

复制为：
- `config.json`

填入 AppID / AppSecret / 文章路径 / 封面策略。

### 第三步：准备文章
二选一：
- 手写 Markdown
- 从 article brief 生成 Markdown

### 第四步：先跑预览
```bash
cd wechat-official-account
npm run preview
```

### 第五步：跑健康检查
```bash
npm run check
```

说明：
- 即使这篇文章此前已经发过，`--check` 也会继续检查 token / 配置
- 不会创建草稿

### 第六步：正式发稿
```bash
node wechat-final.js
```

如需强制重发：

```bash
node wechat-final.js --force
```

---

## 8. OpenClaw 使用这份 skill 时的推荐动作

### 用户说“帮我搭公众号自动发文”
应做：
1. 检查目录是否存在
2. 检查 config 是否缺失
3. 引导或代填 AppID/AppSecret
4. 提醒确认 IP 白名单
5. 放一篇测试文章
6. 跑 preview
7. 跑 check
8. 跑测试草稿发布

### 用户说“帮我生成并发公众号草稿”
应做：
1. 确认输入是 brief 还是 Markdown
2. 若是 brief，先跑 `compose-and-publish.js`
3. 检查封面策略
4. 跑 preview/check
5. 正式发草稿
6. 回报：草稿创建结果 + 输出文件位置

---

## 9. 与其他 skill 的协同

### 与 wechat-article-watch 协同
可把：
- 公众号订阅
- 新文章抓取
- 缓存更新

作为上游输入，喂给当前发布链路。

### 与 wechat-style-rewrite 协同
可把：
- 风格学习
- 改写 brief
- 文章初稿

作为上游生成，再交给发布系统。

---

## 10. 最小成功标准

这条 skill 驱动的搭建至少应验证成功：
- `output/article-preview.html` 已生成
- `npm run check` 已通过
- AI 封面图或本地图封面成功上传
- 草稿已进入公众号后台草稿箱
- `state/published.json` 有最新记录
