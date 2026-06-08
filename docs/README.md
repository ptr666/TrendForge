# TrendForge 文档

这里存放 TrendForge 的长期维护文档。仓库默认展示中文文档；外部工作流包、skill 包或上游项目的原始 README 保持上游原貌。

## 推荐阅读顺序

1. [完整使用流程](usage-flow.md)：按当前 Web 工作台跑通 AIHot-only 主流程。
2. [完整配置指南](configuration.md)：文本模型、图片模型、微信、小红书、原文获取、runsDir 和排障配置。
3. [本地环境](local-setup.md)：安装、启动、端口、日志、runsDir、provider 和 smoke 验证。
4. [项目进度](project-progress.md)：当前已完成能力和后续端到端切片推进方式。
5. [开发流程](development.md)：agent 或开发者如何按技能、TDD、适配器契约和文档同步推进。
6. [外部项目与开源参考](vendor-projects.md)：AIHot、RSSHub、BrowserAct、MediaCrawler、微信和小红书相关参考边界。
7. [Git 工作流](git-workflow.md)：本地提交和推送约定。
8. [维护手册](maintenance-runbook.md)：常见运行、排障和维护动作。
9. [Agent 配置](agents/)：本仓库 agent skills、issue tracker 和领域文档约定。

## 文档放置规则

- 长期规则、运行手册和项目说明放在 `docs/`。
- 稳定架构说明放在 `design/`。
- 临时 PRD、issue 和任务讨论放在 `.scratch/<feature-slug>/`。
- 临时工作记录放在 `docs/working/`，任务结束后删除或归档。
- ADR 只记录难以回退、未来会疑惑、且确实存在取舍的稳定决策。
- 外部项目或共享 skill 包的原始文档不在这里翻译覆盖，只在本项目文档中说明如何接入。

## 当前主流程关键词

```text
AIHot 日报
-> 全选或选择信息
-> 热点分析
-> HTTP 原文获取
-> 中文译文/中文总结/评分
-> 人工勾选候选
-> 生成平台草稿
-> 图片生成和图文预览
-> 平台 handoff
-> artifact 阅读器
-> 运行历史查询/清理
```

RSS/RSSHub 后端能力仍保留，但当前 Web 前端暂时隐藏订阅添加和渠道库入口。原始 JSON 只作为折叠调试信息保留，不再作为默认阅读方式。长任务进度按热点分析、草稿生成、平台推进各自阶段切片，避免旧的原文抓取失败提醒在后续草稿生成中重复显示。
