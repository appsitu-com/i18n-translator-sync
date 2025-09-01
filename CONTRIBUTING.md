# Contributing Guide

Thanks for helping improve **i18n Translator**! This guide explains how to set up your environment, run the project, and submit pull requests.

## Prerequisites
- **Node.js 18+**
- **Yarn** or **npm**
- **VS Code** (latest) with TypeScript support

> **Note about Yarn warning**
> You may see: `The engine "vscode" appears to be invalid.`  
> This is safe to ignore. `"engines.vscode"` is required for VS Code extensions, but Yarn doesn’t validate it. If you prefer to silence it:
> ```bash
> yarn config set ignore-engines true
> ```

## Getting Started
```bash
# clone
git clone https://github.com/yourname/i18n-translator-vscode.git
cd i18n-translator-vscode

# install deps
yarn install    # or: npm install

# build & test
yarn build
yarn test

# debug in VS Code (opens a new window with the extension)
# Press F5 or use the "Run Extension" launch configuration
```

## Running the Extension
1. In VS Code, press **F5** to launch an Extension Host window.
2. In that window, run the commands:
   - **Translator: Start**
   - **Translator: Stop**
   - **Translator: Restart**

The extension watches `i18n/en/**` for Markdown/MDX/JSON, generates translations for configured target locales, and (optionally) back-translations.

## Configuration & Env Vars
Engine settings are read from VS Code settings (see `README.md`). Values can reference environment variables:
- `env:VAR_NAME` or `${VAR_NAME}`
- Missing variables show a friendly error and the current file’s translation is aborted (watchers continue running).

Common env vars:
- `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_REGION`
- `GOOGLE_TRANSLATE_KEY`
- `DEEPL_KEY`

## Project Layout
```
src/
  translators/      # azure, google, deepl, copy (adapter interface)
  util/             # env resolver, http helper
  i18n pipeline/    # extractor, context CSV, cache (better-sqlite3), pipeline, extension

tests/              # mirrors src/ structure (Vitest)
.github/workflows/  # CI, release, publish
doc/                # CI/CD setup
.vscode/            # tasks + launch configs
```

## Testing
- Unit tests use **Vitest** with a mocked `vscode` API.
- Run tests watch-mode for fast feedback:
  ```bash
  yarn test
  yarn test:watch
  ```

## Code Style
- TypeScript strict mode is enabled.
- Prefer small, composable modules.
- Keep translator engines pure (no VS Code API inside engines).
- Use meaningful variable names and include doc comments for exported functions.

## Commit & PR
- Create feature branches: `feat/context-csv-validation`, `fix/azure-locale-normalization`
- Write descriptive commit messages.
- Add or update tests for your change.
- Ensure `yarn build` and `yarn test` pass locally.
- Open a PR with a concise description and screenshots/logs if applicable.

## CI/CD
- **CI**: build + test on push/PR (`.github/workflows/ci.yml`).
- **Release**: create a tag `vX.Y.Z` to build a VSIX and attach it to a GitHub Release.
- **Publish**: when a Release is published, the VSIX is pushed to VS Code Marketplace & Open VSX (if secrets are configured).

## Releasing (maintainers)
```bash
# bump version
npm version patch    # or: minor | major
git push && git push --tags
# GitHub Actions will create the Release and publish to marketplaces if secrets exist
```

## Security & Secrets
Never commit API keys. Use environment variables via VS Code settings (see above).

## Questions?
Open an issue. PRs welcome — thanks for contributing!
