# Git Workflow

## Initialize

```powershell
git init
git status --short
```

## Daily Work

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
git status --short
```

Only commit source, tests, docs, config, `.gitmodules`, and submodule pointers.

Do not commit:

- `node_modules/`
- `dist/`
- `.npm-cache/`
- runtime files under `workspace/`

## Submodule Review

Before committing submodule changes:

```powershell
git submodule status
git diff --submodule
```

Confirm the updated commit is intentional and compatible with the adapter.

## Commit

```powershell
git add .
git status --short
git commit -m "Initial TrendForge workspace"
```

If Git identity is missing, configure it locally:

```powershell
git config user.name "TrendForge Maintainer"
git config user.email "trendforge@example.local"
```

