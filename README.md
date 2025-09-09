# i18n Translator VS Code Extension

<!-- [![CI](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml)
[![Release](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml)
[![Publish](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features
- [x] **Translate on Save** will instantly translate selected Markdown/MDX/JSON/YAML/YML files *as you save* each file.
- [x] **Back translation** from each target language back to the source language that allow you to:
  - You can check which source text was likely mistranslated - even when you can't read the target language
  - View the back translations in your application
  - Update the source text with an alternative source text and instantly re-check in all target languages.
- [x] **Translation folder mirroring**
  - When a folder is selected as the translation source, all changes to files in that folder (create/rename/delete) are mirrored in the target translation folders.
- [x] **Multiple Translation Engines**
  - [x] Copy (no translation)
  - [x] Azure
  - [x] Google
  - [x] DeepL
  - [x] Gemini LLM
  - [ ] Open Router LLMs
  - DeepL supports AI translation of English text to US and UK English.
  - Open Router supports almost *any* LLM models via a single API router service.
  - The "Copy" engine is useful when you wish to keep the source file/folder separate from target files/folders and just make a copy when the source and target are the same language.
- [x] **Contextual Translation** (DeepL, Gemini and OpenRouter) - Experimental. Design is likely to be revised.
  - Problem: Translations of short strings common in user interfaces (like button labels) are often poorly translated by AI engines
  - Solution: Configure contextual information for keys in JSON and YAML files that provides contextual information included in prompts to LLM & DeepL APIs.
- [x] **Translation memory** (TM). We use a database of past translations that allows:
  - Faster & cheaper translations as only *new* or *changed* strings (JSON/YAML) or paragraphs (Markdown/MDX) are retranslated.
  - Ensures translations remain stable as AI engines tend to randomly alter results when retranslating.
  - [W] Automatic purging of unused past translations.
  - [W] Exported/imported to CSV files. CSV exports should be committed to GIT to preserve stable translations and reduce costs.
- [W] **VS Code commmands**:
  - **Translator: Start or Restart** - Activates the Translate on Save service. 1st time it creates an initial `.translate.json` file for your API keys that's excluded from GIT.
  - **Translator: Stop** - Deactivates the "translate on save" feature.
  - **Translator: Retranslate** - Manually retranslate without activating the Translate on Save service.
  - **Translator: Push to MateCat** - Exports the local TM database and pushes it to a MateCat project.
  - **Translator: Pull from MateCat** - Pulls the MateCat project revisions and imports these into the local TM database.

## MateCat integration

We plan to integrate this extension with an online computer aide translation (CAT) service for volunteer and professional translators.
You can then treat your AI translations as _draft_ to be be reviewed and revised by a human translation team.

- [W] *Export & Push* your local TM database to a CAT service project and later *Pull & Import* the revisions back into you local project.
- The [MateCat.com](https://matecat.com) translation service:
  - MateCat is open source platform you can run in house for free or use their *free* cloud service!
  - Invite your own team translators & reviewers or hire their professional translators for 200+ languages and dialects.
  - MateCat has it's own leading edge AI tools and access to an 8 million phrase public TM dictionary used by big tech software companies.
  - Maintain & backup your own private translation memory (TM) dictionary in MateCat or contribute to the public TM.
  - Achieve consistent terminology and translation of terms across your future corporate projects.

## Configuration Options

- Project translation rules can be configured in a local `.translate.json` file (recommended) or in VSCode Workspace or User settings.
- Optional back-translations and context-aware JSON translations.
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

The extension supports project-specific configuration through a `.translate.json` file in the root of your workspace or via your user and workspace settings.
See [Configuration Documentation](doc/Configuration.md) for details.

### api-keys

API keys for translation services are configured via environment variables that you can specify in `.translate.env` or in your operating system.
Ensure that  `.translate.env` is included in your `.gitignore` file to exclude it from GIT.

The first time you run the `Translator: Start` in a project, `.translate.env` will be created (with placeholders) and it's name added to the `.gitignore` file.

You only need to configure keys for the translation services you plan to use.
See the extension settings to select which services to use for which file type.

```ini
# Azure Translation API configuration
# Get API key from: https://learn.microsoft.com/azure/ai-services/translator/translator-how-to-signup
AZURE_TRANSLATION_KEY='XXXXXXXXXXXXXXXXX'
AZURE_TRANSLATION_REGION='westus'
AZURE_TRANSLATION_URL='https://api.cognitive.microsofttranslator.com'

# Google Translate API configuration
# Get API key from: https://cloud.google.com/translate/docs/setup
GOOGLE_TRANSLATION_KEY='XXXXXXXXXXXXXXXXXXXXX'
GOOGLE_TRANSLATION_URL='https://translation.googleapis.com'

# DeepL API configuration
# Get API key from: https://www.deepl.com/pro-api
DEEPL_TRANSLATION_KEY='XXXXXXXXXXXXXXXXXXXXX'
DEEPL_TRANSLATION_URL='https://api-free.deepl.com'

# Gemini AI API configuration
# Get API key from: https://ai.google.dev/tutorials/setup
GEMINI_API_KEY='XXXXXXXXXXXXXXXXXXXXX'

```

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

## License
MIT

