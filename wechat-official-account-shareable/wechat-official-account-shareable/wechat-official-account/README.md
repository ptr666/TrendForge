# 微信公众号发文流程（OpenClaw / QClaw 配套）

这套目录用于把 **Markdown 文章 → 微信公众号草稿** 跑通。

## 目录结构

```text
wechat-official-account/
├─ articles/
│  └─ sample-article.md
├─ lib/
│  ├─ parse-frontmatter.js
│  └─ render-markdown.js
├─ templates/
│  └─ wechat-theme-default.js
├─ output/
│  ├─ article-preview.html
│  └─ article-final.html
├─ state/
│  └─ published.json
├─ config.example.json
├─ config.json            # 你自己复制并填写，不要提交
├─ package.json
├─ README.md
├─ render-wechat-preview.js
└─ wechat-final.js
```

## 你现在要做的事

### 1）准备公众号 API 凭证

登录微信公众号后台：

<https://mp.weixin.qq.com>

路径：

`设置与开发 -> 基本配置`

拿到：
- AppID
- AppSecret

另外确认：
- 服务器出口 IP 已加入白名单
- 使用前请先确认当前出口 IP，并写入对应公众号后台白名单

如果白名单没配，`access_token` 会获取失败。

---

### 2）复制配置文件

在这个目录里执行：

```bash
cp config.example.json config.json
```

然后修改 `config.json`：

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
      "model": "YOUR_IMAGE_MODEL",
      "apiKey": "***"
    }
  },
  "comment": {
    "needOpenComment": true,
    "onlyFansCanComment": false
  }
}
```

也支持不用把密钥写进文件，直接用环境变量覆盖：

```bash
export WECHAT_APPID='你的 AppID'
export WECHAT_APPSECRET='你的 AppSecret'
```

如果你本来就有旧脚本，比如 `wechat-publish-v3.js`，还可以把：

```json
"legacyCredentialSource": "./wechat-publish-v3.js"
```

留着不动。这样新脚本会尝试从旧脚本里提取 `APPID` / `APPSECRET`，方便兼容旧流程。

---

### 3）放入文章 Markdown

把正式文章放到 `articles/` 目录。

要求：
- 推荐在文章开头使用 YAML frontmatter 管理发布元数据
- 第一行 `# 标题` 仍然会被当成正文主标题来源
- 正文现在支持更标准的 Markdown 渲染和公众号样式包装

示例：

```md
---
title: 文章标题
author: QClaw 运营助手
digest: 这里写摘要
cover: ./covers/你的封面图.png
source_url: ""
---

# 文章标题

## 开场

这是正文。

> 这是一个引用块。

## 第二部分

- 要点 1
- 要点 2
```

### 3.5）可选：指定本地封面图

如果你想优先使用本地封面图，在 `config.json` 里填写：

```json
"cover": {
  "width": 1280,
  "height": 720,
  "imagePath": "./covers/你的封面图.png",
  "prompt": "",
  "ai": {
    "baseUrl": "https://your-openai-compatible-api.example.com/v1",
    "model": "YOUR_IMAGE_MODEL",
    "apiKey": "你的生图 API Key"
  }
}
```

说明：
- 有 `imagePath`：优先上传本地封面图
- `cover.ai.mode = "generate"`：没有 `imagePath` 时，改走当前供应商**实测可用**的方式：`/v1/responses` + `gpt-5.4` + 自然语言描述 + `tools: [{ type: "image_generation" }]`
- `cover.ai.mode = "prompt-only"`：没有 `imagePath` 时，只输出封面提示词到 `output/cover-prompt.txt`，不直接请求生图接口；发布时会先用渐变兜底图继续走流程
- 如果 AI 生图失败：自动回退到本地渐变封面图兜底

### 3.6）AI 生图封面（通过 OpenAI 兼容供应商路由）

现在这套工作流支持通过 **OpenAI 兼容供应商** 生成公众号封面图。

建议把实际可用的图片模型写进：

```text
cover.ai.model
```

并通过对应的 OpenAI 兼容接口路由。

这意味着你后续如果让我“先生成封面图，再发公众号”，默认就会走这条生图链路。

推荐说法：

```text
先帮我生成一张公众号封面图，
风格：科技感、中文海报、适合公众号头图，
比例：16:9。
生成后直接用于这篇文章的封面，再发布草稿。
```

当前封面策略变成：
- 如果你明确给本地 `imagePath`，优先用本地图
- 如果没有本地图，发布脚本默认走当前供应商实测可用的 Responses 自然语言生图链路
- 发布记录中的 `coverSource` 会明确记成实际调用方式，例如 `ai:responses:gpt-5.4:image_generation`
- 如果 AI 生图失败，再回退到脚本自动生成的渐变封面图

---

### 3.7）先看本地预览（推荐）

```bash
cd wechat-official-account
node render-wechat-preview.js
```

或者直接用 npm script：

```bash
npm run preview
```

生成后查看：

`wechat-official-account/output/article-preview.html`

这个文件用于先检查文章排版效果，再决定是否正式发草稿。

正式发布后，还会额外生成：
- `output/article-final.html`：正文图片替换成微信图床 URL 后的最终 HTML
- `state/published.json`：最近发布记录

### 3.8）推荐先跑一轮 preview-only / smoke test

如果你刚改过：
- `templates/wechat-theme-default.js`
- `compose-and-publish.js`
- `article-brief.example.json`
- `chat-publish-template.md`
- 或任意文章骨架 / 排版逻辑

推荐先跑这条**不发稿的安全验证链路**：

#### A. 已有 Markdown 时

```bash
cd wechat-official-account
npm run preview
npm run check
```

用途：
- `npm run preview`：验证 Markdown → HTML → 主题排版是否正常
- `npm run check`：验证配置、文章路径、公众号 access_token 是否正常
- 即使这篇文章此前已经发布过，`--check` 也会继续做 token / 配置健康检查
- **不会创建草稿**

#### B. 改了 brief / 成稿骨架时

先复制一份测试 brief：

```bash
cp article-brief.example.json article-brief.test.json
```

再按需要改一个测试标题，避免和历史文章撞上幂等保护。

然后可以先用这个思路验证：
- 先运行 `node compose-and-publish.js article-brief.test.json`
- 如果你只是想看生成结果，发布前建议先保留输出文件、检查 `articles/` 下的新 Markdown
- 再决定要不要进入真实草稿箱测试

#### C. 什么时候再跑真实发稿测试

当下面三件事都正常时，再跑真实草稿测试最稳：
- 预览 HTML 版式正常
- `--check` 正常通过
- 新生成的 Markdown 结构符合预期

这样可以把“排版问题 / 骨架问题”和“公众号接口 / AI 封面图问题”分开排查，省很多时间。

### 4）先跑检查模式

```bash
cd wechat-official-account
node wechat-final.js --check
```

这一步只做：
- 配置文件检查
- 文章文件检查
- access_token 获取检查

不会创建草稿。

---

### 5）正式创建草稿

默认带幂等保护：
- 如果同一篇文章内容已经发布过，会自动跳过，避免重复发稿
- 如果你确认要重发，使用：

```bash
node wechat-final.js --force
```


```bash
cd wechat-official-account
node wechat-final.js
```

成功后到公众号后台查看：

`内容与互动 -> 草稿箱`

---

## 推荐的内容生产流程（升级版）

这一版流程的目标，不只是“把文章发出去”，而是尽量让生成结果一开始就更像公众号成稿，而不是后面再大量返工。

### 流程 ①：先定选题和传播目标

如果你还没有成型思路，先用这类说法让我帮你把方向拆出来：

```text
我想写一篇关于【主题】的文章，
目标读者是【人群描述】，
传播目标是【希望读者看完后的行动 / 认知变化】。
请帮我生成 2-3 个选题角度，并给出更适合公众号表达的大纲。
```

### 流程 ②：直接用对话模板生成并发布

现在更推荐直接走 `chat-publish-template.md` 里的模板，而不是先手工拼很多零散指令。

#### 最简可发版

```text
请直接生成并发布公众号草稿：
主题：【你的主题】
目标读者：【你的目标读者】
传播目标：【你希望读者看完后产生什么行动 / 认知】
参考资料：【可选，没有就写“无”】
文章风格：【可选，例如：真诚、锋利、冷静、实战】
是否使用本地封面图：【可选，填路径；没有就写“无”】
```

#### 增强成稿版

如果你希望文章更像公众号成品文，而不是普通说明文，可以直接补这些控制项：

```text
请直接生成并发布公众号草稿：
主题：【你的主题】
目标读者：【你的目标读者】
传播目标：【你希望读者看完后产生什么行动 / 认知】
核心观点：【这篇文章最想打透的一句话】
文章风格：【例如：真诚、锋利、冷静、克制、实战、故事化】
开头感觉：【例如：代入感强 / 直接切痛点 / 先讲反常识 / 像朋友聊天】
结构倾向：【例如：3 段式 / 问题-分析-建议 / 先破题再拆解】
希望包含的案例或场景：【可选】
希望给读者的行动建议：【可选】
参考资料：【可选，没有就写“无”】
是否使用本地封面图：【可选，填路径；没有就写“无”】
```

如果你还想进一步强调成稿感，可以再补一句：

```text
请把这篇文章写得更像公众号成品文：
- 开头要有导语感
- 中间要有一句可传播观点
- 每一节不要只像说明文，要更像在和读者说话
- 结尾要有自然收束和行动引导
```

### 流程 ③：如果要人工控结构，就走结构化 brief

如果你不想完全靠对话描述，也可以直接写 `article-brief.json`，然后自动生成 Markdown 并发布。

先复制模板：

```bash
cp article-brief.example.json article-brief.json
```

现在推荐优先使用这些字段：
- `title`
- `digest`
- `lead`
- `quote` / `keyTakeaway`
- `sections`
  - `heading`
  - `lead`
  - `paragraphs`
  - `bullets`
  - `examplesHeading` + `examples`
  - `actionHeading` + `actionItems`
  - `closing`
- `conclusion`
- `cta`
- 可选 `coverImagePath`

执行：

```bash
node compose-and-publish.js article-brief.json
```

它会自动做 3 件事：
- 生成带 frontmatter 的 Markdown 到 `articles/`
- 更新 `config.json` 的 `articlePath`
- 直接调用发布脚本创建草稿

### 流程 ④：如果你已经有 Markdown，就直接发布

如果文章已经写好，不需要再走 brief 生成，只要把 `config.json` 里的 `articlePath` 指到目标文章，然后执行：

```bash
node wechat-final.js
```

### 流程 ⑤：标题优化（可选）

如果正文已经有了，但你还想再优化标题，可以单独再跑一轮标题生成：

```text
请基于下面这篇文章，给我 8 个更适合公众号传播的标题候选，
并推荐一个最优标题。

目标读者：【人群】
文章核心观点：【一句话概括】
文章正文：
【粘贴正文或摘要】
```

---

## API 流程说明

固定是 3 步：

1. `GET /cgi-bin/token`
   - 获取 `access_token`
2. `POST /cgi-bin/material/add_material`
   - 上传封面图到永久素材库
   - 返回 `thumb_media_id`
3. `POST /cgi-bin/draft/add`
   - 创建公众号草稿

---

## 踩坑记录

### 1. `40113 unsupported file type`
原因：
- 封面图太小
- 图片内容太纯，像无效图

解法：
- 用较大的 PNG
- 不要纯色
- 当前脚本会生成带渐变和噪声的 PNG

### 2. `40007 invalid media_id`
原因：
- `thumb_media_id` 不能用临时素材

解法：
- 必须使用永久素材接口：
  - `/cgi-bin/material/add_material`
- 不要用临时素材接口：
  - `/cgi-bin/media/upload`

### 3. 正文图片处理
原因：
- 公众号正文里的本地图片不能直接用本地路径发布

解法：
- 发布时会自动扫描正文里的图片
- 本地图片会自动上传到微信正文图片接口 `/cgi-bin/media/uploadimg`
- 远程图片也会先下载，再转传到微信
- 成功后自动替换成微信可访问 URL

### 4. frontmatter 封面图优先级
原因：
- 现在文章自身也可以通过 frontmatter 指定 `cover`

解法：
- 优先使用文章 frontmatter 里的 `cover`
- 其次使用 `config.json` 里的 `cover.imagePath`
- 都没有时再走当前配置的图片模型生图
- 生图失败时才回退到渐变兜底图

### 5. 重复发布保护
原因：
- 调试阶段容易把同一篇文章反复发到草稿箱

解法：
- 脚本会根据 `文章路径 + 标题 + 最终 HTML + digest` 生成发布指纹
- 如果发现同一指纹已经发布过，会自动跳过
- 如需重发，使用 `--force`

### 6. 成功时没有 `errcode`
原因：
- 微信很多成功响应不会返回 `errcode: 0`

解法：
- 判断逻辑要兼容 `errcode` 缺失

### 4. 文件名和 MIME 类型不匹配
原因：
- 传的是 PNG，但文件名写成 `.jpg`

解法：
- 统一使用 `cover.png` + `image/png`

### 5. IP 白名单问题
原因：
- 后台没配请求来源 IP

解法：
- 把实际出口 IP 加到公众号后台白名单

---

## 当前实现相比你给的脚本，我做了这些加固

- 不把密钥硬编码到源码里
- 增加 `config.json` 配置方式
- 支持从旧脚本继承凭证（兼容 `wechat-publish-v3.js` 这类历史文件）
- 支持 `--check` 检查模式
- 对返回结果做更稳的错误处理
- 自动校验文章文件是否存在
- README 里把完整流程写清楚了

---

## 新增能力

### C. 对话里直接给主题 / 读者 / 目标，我代你生成并发布

现在起你可以直接在聊天里这样发：

```text
请直接生成并发布公众号草稿：
主题：【你的主题】
目标读者：【你的目标读者】
传播目标：【你希望读者看完后产生什么行动/认知】
参考资料：【可选，没有就写“无”】
文章风格：【可选，例如：冷静、锋利、真诚、实战】
是否使用本地封面图：【可选，填路径；没有就写“无”】
```

我会在对话里直接完成：
- 生成文章结构
- 生成 Markdown 正文
- 落盘到 `articles/`
- 更新 `config.json`
- 调用脚本发布到公众号草稿箱

配套模板文件：
- `chat-publish-template.md`
- `article-brief.schema.json`

### A. 本地封面图优先

现在脚本逻辑是：
- 如果 `config.cover.imagePath` 有值，优先上传本地封面图
- 如果没有，就自动生成封面图

### B. 自动写 Markdown 后一键发布

新增脚本：

```bash
node compose-and-publish.js article-brief.json
```

适合把 AI 生成的结构化内容，快速落成 Markdown 并直接发到公众号草稿箱。

---

## 后续可以继续扩展

1. 支持本地自定义封面图，而不是自动生成
2. 支持文内图片上传后替换 Markdown 图片链接
3. 支持定时执行（比如配合 cron）
4. 支持多篇文章合并成一次群发素材
5. 支持从 OpenClaw 直接一键生成文章文件后发布
