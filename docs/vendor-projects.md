# Vendor Projects

TrendForge uses external projects through adapters. They should be installed as Git submodules under `vendor/`.

## BrowserAct

- Path: `vendor/browser-act-skills`
- Repository: `https://github.com/browser-act/skills.git`
- Role: browser verification, dynamic pages, full-text fallback.
- TrendForge behavior: command planning first; do not execute browser actions by default.

## RSSHub

- Path: `vendor/rsshub`
- Repository: `https://github.com/DIYgod/RSSHub.git`
- Role: normal RSS and RSSHub route subscriptions.
- TrendForge behavior: consume RSS output through `packages/sources`.

## MediaCrawler

- Path: `vendor/mediacrawler`
- Repository: `https://github.com/NanmiCoder/MediaCrawler.git`
- Role: explicit fallback collector for supported Chinese media platforms.
- TrendForge behavior: disabled by default; requires compliance review before use.

## AI HOT

- Skill / Agent entry: `https://aihot.virxact.com/aihot-skill/`
- Role: highest-priority AI trend information source.
- Supported access modes: skill, RSS, and REST API.
- TrendForge behavior: prefer the skill information feed first; use AI HOT RSS as the same-source fallback; use generic RSSHub only after AI HOT sources are unavailable or not relevant.

## Xiaohongshu Browser Draft Setup Skill

- Path: `xhs-browser-draft-setup-package/xhs-browser-draft-setup/SKILL.md`
- Implementation provenance: `https://github.com/autoclaw-cc/xiaohongshu-skills`
- Role: share-safe setup, validation, troubleshooting, and documentation helper for the Xiaohongshu browser draft workflow through Hermes, browser bridge, Chrome extension, login checks, page fill, draft save, and optional publish commands.
- TrendForge behavior: treat this package as the local workflow skill entry. Plan commands and dry-runs first; do not execute real browser draft or publish actions from tests or default skeleton commands.

## WeChat Official Account Workflow Skill

- Skill path: `wechat-official-account-shareable/skills/wechat-official-account-workflow/SKILL.md`
- Workflow path: `wechat-official-account-shareable/wechat-official-account/`
- Role: setup, configuration, preview, check, article brief to Markdown composition, AI cover handling, image upload, and WeChat Official Account draft creation.
- Implementation: Node workflow using the official WeChat API for media upload and draft creation.
- TrendForge behavior: preview and check may be planned by default; real draft creation requires explicit user action, valid official API credentials, and correct IP whitelist configuration.

## Add Submodules

Preferred commands:

```powershell
git submodule add --depth 1 https://github.com/browser-act/skills.git vendor/browser-act-skills
git submodule add --depth 1 https://github.com/DIYgod/RSSHub.git vendor/rsshub
git submodule add --depth 1 https://github.com/NanmiCoder/MediaCrawler.git vendor/mediacrawler
git submodule status
```

If the local Git submodule command cannot find Git's Unix helper tools on Windows, use a Git environment where `git submodule` works, or repair the Git PATH so `usr/bin` and `mingw64/libexec/git-core` are available.

## Update Submodules

```powershell
git submodule update --remote --depth 1 vendor/browser-act-skills
git submodule update --remote --depth 1 vendor/rsshub
git submodule update --remote --depth 1 vendor/mediacrawler
git status --short
```

Commit the updated gitlink pointers in the main repository after review.
