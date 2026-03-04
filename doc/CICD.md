# CI/CD Setup Guide

This project uses GitHub Actions for **CI** (build + tests) and **CD** (package and publish).

All workflows use a unified packaging script (`scripts/package-extension.js`) to ensure consistency between local development and CI/CD environments.

## 1) CI: Build & Test
Workflow: `.github/workflows/ci.yml`

- Triggers on pushes to `main` and on PRs
- Installs dependencies, builds, and runs Vitest tests with coverage
- Uploads coverage to Codecov if `CODECOV_TOKEN` is set
- Translation API keys are scoped to the test step only for security

## 2) Release: Tag → GitHub Release
Workflow: `.github/workflows/release.yml`

- **Trigger**: push a tag matching `v*.*.*` (e.g., `v0.2.3`)
- **Steps**:
  1. Checks out code
  2. Installs dependencies with pnpm
  3. Extracts version from git tag (e.g., `v1.2.3` → `1.2.3`)
  4. Runs `pnpm package --version=X.Y.Z --ci` (unified packaging script)
  5. Creates GitHub Release and attaches VSIX from `releases/` directory

**Unified Packaging**: The workflow uses the same packaging script as local development, ensuring:
- Configuration samples are copied to the VSIX
- Icons are properly generated
- Package.json metadata is updated
- Version validation (tag must match package.json version)
- No redundant builds (optimized build process)

Create and push a tag:
```bash
# Update version in package.json first
pnpm package   # Interactive version selection

# Then follow the displayed git commands:
git add package.json
git commit -m "Release version X.Y.Z"
git tag -a vX.Y.Z -m "Version X.Y.Z"
git push origin main --tags
```

## 3) Publish to Marketplaces
Workflow: `.github/workflows/publish.yml`

- **Trigger**: when a GitHub Release is **published** (not drafted)
- **Steps**:
  1. Checks out code
  2. Installs dependencies
  3. Extracts version from release tag
  4. Runs `pnpm package --version=X.Y.Z --ci` (unified packaging script)
  5. Publishes VSIX from `releases/` directory to:
     - VS Code Marketplace (requires `VSCE_PAT` secret)
     - Open VSX (currently disabled with `if: false`)

## 4) Required Secrets
- `VSCE_PAT` — VS Code Marketplace Personal Access Token
- `OVSX_TOKEN` — Open VSX token (optional, not currently used)
- `CODECOV_TOKEN` — Codecov token (optional, for coverage reporting)
- Translation API keys (for CI tests):
  - `AZURE_TRANSLATION_KEY`
  - `DEEPL_TRANSLATION_KEY`
  - `GEMINI_API_KEY`
  - `GOOGLE_TRANSLATION_KEY`
  - `OPENROUTER_API_KEY`

Add secrets: **Settings → Secrets and Variables → Actions → New repository secret**.

## 5) Local Packaging

The unified packaging script handles all necessary preparation:

```bash
# Full interactive packaging (recommended for releases)
pnpm package

# CI mode (no prompts, uses package.json version)
pnpm package:ci

# Quick package without version management (testing only)
pnpm package:quick
```

The build process is optimized to avoid redundant builds:
- `pnpm package` calls `vsce package`, which automatically triggers `vscode:prepublish`
- The `vscode:prepublish` hook rebuilds SQLite for Electron and compiles TypeScript
- No manual `pnpm build` needed before packaging

## 6) Debug Locally
- Press **F5** in VS Code to launch a new Extension Host window
- Use the **Run Extension** launch config

## 7) Troubleshooting

### Version Mismatch Error

If the release workflow fails with a version mismatch error:
```
ERROR: Provided version (X.Y.Z) does not match package.json version (A.B.C)
```

**Cause**: The git tag version doesn't match the version in package.json.

**Solution**:
1. Check the version in `package.json`
2. Ensure you've committed the version change before tagging
3. Delete the incorrect tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
4. Update package.json version correctly
5. Commit and create a new tag with the correct version

### Missing Sample Files in VSIX

If configuration samples are missing from the packaged VSIX:

**Cause**: Using `pnpm package:quick` or direct `vsce package` bypasses asset preparation.

**Solution**: Use `pnpm package` or `pnpm package:ci` instead, which runs the full preparation workflow.

### Build Running Twice

This has been resolved! Previously, builds ran twice (manual + vscode:prepublish hook). The unified packaging script now relies solely on the `vscode:prepublish` hook triggered by `vsce package`.
