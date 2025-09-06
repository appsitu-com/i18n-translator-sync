# i18n Translator VS Code Extension

<!-- [![CI](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml)
[![Release](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml)
[![Publish](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## License
MIT

## Features
- Watches multiple source paths (configurable) and generates translated Markdown/MDX/JSON/YAML/YML files into `i18n/<locale>/**`.
- Project-specific configuration via `.translate.json` file.
- Optional back-translations and context-aware JSON translations.
- Translation server Start/Stop/Restart commands and VSCode Status bar.
- AI Translation Engines: Azure, Google, Gemini, DeepL and a no-translate Copy engine (e.g. for en-US or en-GB).
- DeepL supports `en-US` => `en-GB` translations.
- Back-translation folders `<locale>_en/**`
- Configurable options:
  - Multiple source paths to monitor for translation
  - Source and target locales
  - Default translation engines for different file types
  - Language-specific engine selection
- Context-aware translations per JSON path (e.g. informs engine that translation is for a button label, menu text etc)
- Translation cache DB with CSV import/export
  - Optimizes translation speed, reduces AI translation costs and removes AI translation "drift".
- Future: Integration with Volunteer/ Pro translation team

## Configuration

The extension supports project-specific configuration through a `.translate.json` file in the root of your workspace. See [Configuration Documentation](doc/Configuration.md) for details.

## Code Architecture

For information about the internal architecture of the extension, see [Architecture Documentation](doc/Architecture.md).

### Configuration Files

- `.translate.json` - This file comes with the extension as a default configuration example. You can modify it directly for your project.
- `.translate.json.sample` - This is a template file that you can copy and modify for your own configuration.

Both files are included in the extension and can be used as a starting point for your project configuration.

Example `.translate.json`:
```json
{
  "sourcePaths": ["i18n/en", "docs/en"],
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de", "ja", "zh-CN"],
  "enableBackTranslation": true,
  "defaultMarkdownEngine": "azure",
  "defaultJsonEngine": "google",
  "engineOverrides": {
    "deepl": ["fr", "de"],
    "azure": ["es:en", "ja:en"],
    "gemini": ["zh-CN"]
  }
}
```

## Dev quick start
```bash
# Install dependencies
yarn

# Build the extension
yarn build

# Run tests
yarn test

# Package the extension
yarn package

# Press F5 in VS Code to launch a new window with the extension
```

### Packaging and Versioning
The extension uses:
- Yarn for local project dependencies
- npm for global tools (like @vscode/vsce)

To create a VSIX package with version management:
```bash
# Run the packaging script with interactive version selection
yarn package
```

This will:
1. Prompt you to select a version update type:
   - Major version (x.0.0) - For breaking changes
   - Minor version (0.x.0) - For new features (backward compatible)
   - Patch version (0.0.x) - For bug fixes (backward compatible)
   - Custom - Enter a specific version number
2. Update the version in package.json
3. Build the extension
4. Package it as a VSIX file in the `releases/` directory
5. Display git commands to tag the release

You can also update the version independently:
```bash
# Update version only (without packaging)
yarn version:update
```

### Tagging Releases

After creating a new version, the script will provide git commands to create and push a tag for the release:

```bash
# Commit the version change
git add package.json
git commit -m "Release version X.Y.Z"

# Create an annotated tag
git tag -a vX.Y.Z -m "Version X.Y.Z"

# Push changes and tags
git push origin main --tags
```

### Cross-Platform Native Dependencies

This extension uses `better-sqlite3`, which is a native module that requires platform-specific binaries. The packaging configuration is set up to handle cross-platform compatibility:

- The extension uses the `vsce` packaging tool's native dependency support
- In `package.json`, the `vsce.dependencies` array specifies which native modules to include
- This ensures that the packaged extension will work on Windows, macOS, and Linux

This approach is the recommended way to handle native dependencies in VS Code extensions, ensuring that end users don't need to install any additional dependencies.

For development iterations, you can create a quick package without updating the version:
```bash
# Create package without version selection
yarn package:quick
```

If you need to regenerate the extension icon:
```bash
# Regenerate the PNG icon from SVG
yarn package:regenerate-icon
```


## Coverage
Run tests with coverage and produce `coverage/lcov.info` (used by Codecov):
```bash
npm run test:cov
```

