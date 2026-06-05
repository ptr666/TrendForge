# 排障与联调说明

## 1. token 获取失败

### 典型报错
- `invalid ip not in whitelist`
- `Token 获取失败`

### 排查顺序
1. 当前出口 IP 是否正确
2. 是否写入对应公众号后台的 IP 白名单
3. 是否保存且已生效
4. AppID / AppSecret 是否对应同一个公众号

---

## 2. --check 没做真实检查

这项已经修过：
- 现在 `--check` 会先做 token 检查
- 即使文章此前已经发过，也不会提前退出

---

## 3. AI 封面图不出图

### 当前实测可用链路
- `/v1/responses`
- `model: gpt-5.4`
- `tools: [{ type: "image_generation" }]`
- 自然语言图片描述

### 当前已知不可依赖链路
- 某些第三方兼容层下：
  - `/v1/images/generations`
  - `YOUR_IMAGE_MODEL`

可能报：
- `Tool choice 'image_generation' not found in 'tools' parameter.`

### 回退策略
1. 本地图
2. prompt-only
3. 渐变兜底图

---

## 4. 草稿创建失败

### 重点看
- 封面图是否用的是永久素材 `media_id`
- 是否走了 `/cgi-bin/material/add_material`
- 成功判断不能只盯 `errcode === 0`
- 微信成功时可能完全不返回 `errcode`

### 当前脚本已处理
- 封面图统一走永久素材库
- 成功判断已兼容 `!draftRes.errcode`
- PNG 文件名与 MIME 已对齐

---

## 5. 发布记录怎么看

文件：
- `state/published.json`

重点字段：
- `publishedAt`
- `title`
- `thumbMediaId`
- `coverSource`
- `articleImageCount`

### coverSource 说明
- 本地图：本地路径
- prompt-only：`prompt-only:<path>`
- AI 生图：`ai:responses:gpt-5.4:image_generation`
- 兜底图：`fallback:gradient`

---

## 6. 推荐联调顺序

每次改动后，优先按这个顺序：
1. `npm run preview`
2. `npm run check`
3. 新文章先走测试稿
4. 需要重发再 `--force`

这样能把：
- 排版问题
- token / 白名单问题
- 生图问题
- 微信草稿接口问题

拆开定位，效率最高。
