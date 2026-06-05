# 完整功能介绍与日常使用

## 1. 这套 skill 能做什么

### A. 搭建与初始化
- 从零检查并搭建 `wechat-official-account` 工作流
- 补齐 `config.json`
- 指导准备 AppID / AppSecret / IP 白名单

### B. 文章生成
- 支持直接使用 Markdown
- 支持使用 article brief 自动生成成稿
- 支持从 brief 自动更新 `config.json`

### C. 预览与验证
- 生成本地预览 HTML
- 运行 token / 配置 / 路径健康检查
- 与真实草稿发布分离，降低联调风险

### D. 封面图策略
- frontmatter 本地封面图
- config 本地封面图
- AI 自然语言封面生成
- prompt-only
- 渐变兜底图

### E. 微信发布
- 上传封面图到永久素材库
- 上传正文图片到微信图床
- 创建公众号草稿
- 记录最终 HTML 与发布状态

### F. 幂等与状态
- 根据文章路径 + 标题 + 内容 + 摘要做指纹
- 避免重复发稿
- 支持 `--force` 重发
- 记录 `publishedAt`、`thumbMediaId`、`coverSource` 等

---

## 2. 典型命令

### 本地预览
```bash
npm run preview
```

### 健康检查
```bash
npm run check
```

### 正式发稿
```bash
node wechat-final.js
```

### 强制重发
```bash
node wechat-final.js --force
```

### 从 brief 直接成稿并发草稿
```bash
node compose-and-publish.js article-brief.json
```

---

## 3. brief 驱动流程

适用于“我给你主题/大纲/人群，你直接生成成稿并发草稿”。

### 输入
- 标题
- 摘要
- lead
- quote
- sections
- conclusion / cta

### 流程
1. 读取 `article-brief.json`
2. 生成 Markdown 到 `articles/`
3. 更新 `config.json`
4. 调用 `wechat-final.js`
5. 创建草稿

---

## 4. 结果产物

### 预览文件
- `output/article-preview.html`

### 最终 HTML
- `output/article-final.html`

### 封面提示词
- `output/cover-prompt.txt`（仅 prompt-only 模式）

### 发布状态
- `state/published.json`

---

## 5. 让 OpenClaw 直接执行时的推荐话术

### 场景 1：搭建
- 帮我把公众号自动发文工作流从零搭起来
- 根据 AppID / AppSecret 帮我配好公众号草稿自动发布

### 场景 2：发测试稿
- 用这篇 Markdown 帮我发一个公众号测试草稿
- 先预览、再检查、最后发草稿

### 场景 3：从 brief 开始
- 根据这个 article brief 直接生成成稿并发布到公众号草稿箱
- 先用 AI 生成封面图，再发公众号草稿

### 场景 4：排障
- 帮我检查公众号发稿链路为什么不通
- 帮我看是不是 token、白名单还是封面图接口的问题

---

## 6. 可扩展方向

这套 skill 适合继续往上接：
- `wechat-article-watch`：监控公众号更新、搜集素材
- `wechat-style-rewrite`：学习某公众号风格并生成新稿
- 定时任务：批量生成草稿、定时检查、内容池更新
