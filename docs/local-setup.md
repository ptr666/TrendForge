# Local Setup

## Requirements

- Node.js 20 or newer
- npm
- Git

## Install

Use a project-local npm cache on this machine because the global npm cache may point outside the workspace:

```powershell
npm.cmd install --cache .\.npm-cache
```

## Validate

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
```

## Run CLI

```powershell
npm.cmd run cli -- run --query "AI workflow demo" --platforms review,wechat,xhs
```

The command writes run records into `workspace/runs/`.

## Run API

```powershell
npm.cmd run api
```

Then use:

- `GET /health`
- `POST /pipeline/run`
- `GET /runs`
- `GET /items`
- `GET /drafts`
- `GET /sources`
- `GET /publishers`

Real collection and publishing remain disabled unless explicitly wired through adapters.

