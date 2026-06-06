# Git 工作流

## 初始化

```powershell
git init
git status --short
```

## 日常开发

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
git status --short
```

只提交源码、测试、文档、配置、`.gitmodules` 和 submodule 指针。

不要提交：

- `node_modules/`
- `dist/`
- `.npm-cache/`
- `workspace/` 下的运行文件

## Submodule 审查

提交 submodule 变化前运行：

```powershell
git submodule status
git diff --submodule
```

确认更新后的 commit 是有意选择的，并且与 adapter 兼容。

## 提交

```powershell
git add .
git status --short
git commit -m "Initial TrendForge workspace"
```

如果 Git identity 缺失，可只在本仓库配置：

```powershell
git config user.name "TrendForge Maintainer"
git config user.email "trendforge@example.local"
```
