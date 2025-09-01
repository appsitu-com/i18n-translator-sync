# i18n Translator VS Code Extension

[![CI](https://github.com/yourname/i18n-translator-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/i18n-translator-vscode/actions/workflows/ci.yml)
[![Release](https://github.com/yourname/i18n-translator-vscode/actions/workflows/release.yml/badge.svg)](https://github.com/yourname/i18n-translator-vscode/actions/workflows/release.yml)
[![Publish](https://github.com/yourname/i18n-translator-vscode/actions/workflows/publish.yml/badge.svg)](https://github.com/yourname/i18n-translator-vscode/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Watches `i18n/en/**` and generates translated Markdown/MDX/JSON files into `i18n/<locale>/**`, with optional back-translations and context-aware JSON translations. Engines: Azure, Google, DeepL, and a Copy engine.

## Features
- Watcher for add/change/delete/rename with pruning of empty dirs
- Back-translation folders `<locale>_en/**`
- Engines: azure/google/deepl/copy with per-pair overrides
- Context-aware JSON via sibling CSV `path,context`
- SQLite cache (better-sqlite3) with CSV import/export
- Start/Stop/Restart commands

## Dev quickstart
```bash
npm i
npm run build
npm run test
# Press F5 in VS Code to launch a new window with the extension
```
## License
MIT


## Coverage
Run tests with coverage and produce `coverage/lcov.info` (used by Codecov):
```bash
npm run test:cov
```
