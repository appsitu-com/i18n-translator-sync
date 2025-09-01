# CI/CD Setup Guide - NOT yet tested!!

This project ships with GitHub Actions for **CI** (build + tests) and **CD** (package and publish).

## 1) CI: Build & Test
Workflow: `.github/workflows/ci.yml`

- Triggers on pushes to `main` and on PRs
- Installs deps, builds, runs Vitest
- Optional: uploads coverage to Codecov if `CODECOV_TOKEN` is set

## 2) Release: Tag → GitHub Release
Workflow: `.github/workflows/release.yml`

- Trigger: push a tag matching `v*.*.*` (e.g. `v0.2.0`)
- Steps: install → build → `vsce package`
- Output: attaches `*.vsix` to the GitHub Release

Create a tag:
```bash
npm version patch   # or minor/major
git push --follow-tags
```

## 3) Publish to Marketplaces
Workflow: `.github/workflows/publish.yml`

- Trigger: when a GitHub Release is **published**
- Publishes the VSIX to:
  - VS Code Marketplace (requires `VSCE_PAT` repo secret)
  - Open VSX (requires `OVSX_TOKEN` repo secret)

## 4) Required Secrets
- `VSCE_PAT` — VS Code Marketplace token
- `OVSX_TOKEN` — Open VSX token
- `CODECOV_TOKEN` — optional, for coverage reporting

Add secrets: **Settings → Secrets and Variables → Actions → New repository secret**.

## 5) Local Packaging
```bash
npm i -g @vscode/vsce
npm run build
vsce package            # produces .vsix
```

## 6) Debug Locally
- Press **F5** in VS Code to launch a new Extension Host window
- Use the **Run Extension** launch config
