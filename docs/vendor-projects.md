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

