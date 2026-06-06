# Issue tracker：本地 Markdown

本仓库的 issues 和 PRDs 以 markdown 文件形式放在 `.scratch/`。

## 约定

- 每个 feature 一个目录：`.scratch/<feature-slug>/`
- PRD 文件：`.scratch/<feature-slug>/PRD.md`
- 实现 issue 文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- Triage 状态写在每个 issue 文件靠前位置的 `Status:` 行
- 评论和对话历史追加到文件底部的 `## Comments` 标题下

## 当技能说“publish to the issue tracker”

在 `.scratch/<feature-slug>/` 下创建新文件；目录不存在时一并创建。

## 当技能说“fetch the relevant ticket”

读取用户给出的路径或 issue 编号对应文件。用户通常会直接传路径或编号。

## TrendForge 切片规则

实现 issue 应尽量是贯穿 TrendForge pipeline 的垂直切片。当相关层存在时，优先让一个 issue 从 source input 贯穿 verification、selection、drafting、media planning、storage、API/CLI exposure 和 tests。

避免只写“实现 package X”这种横向任务，除非 package 级工作本身可以独立验证。
