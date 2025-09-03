# i18n Translator VS Code Extension

<!-- [![CI](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml)
[![Release](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml)
[![Publish](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## License
MIT

## Features
- Watches `i18n/en/**` and generates translated Markdown/MDX/JSON files into `i18n/<locale>/**`.
- Optional back-translations and context-aware JSON translations.
- Translation server Start/Stop/Restart commands and VSCode Status bar.
- AI Translation Engines: Azure, Google, DeepL and a no-translate Copy engine (e.g. for en-US or en-GB).
- DeepL supports `en-US` => `en-GB` translations.
- Back-translation folders `<locale>_en/**`
- Settings:
  - Watch source and target folder paths
  - Default translation engine
  - Language specific engine
- Context-aware translations per JSON path (e.g. informs engine that translation is for a button label, menu text etc)
- Translation cache DB with CSV import/export
  - Optimizes translation speed, reduces AI translation costs and removes AI translation "drift".
- Future: Integration with Volunteer/ Pro translation team

## Dev quick start
```bash
npm i
npm run build
npm run test
# Press F5 in VS Code to launch a new window with the extension
```


## Coverage
Run tests with coverage and produce `coverage/lcov.info` (used by Codecov):
```bash
npm run test:cov
```

