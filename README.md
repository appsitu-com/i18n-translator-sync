# i18n Translator - VS Code extension and CLI tool for instant file translation. Supports many AI engines + a professional CAT service.

<!-- [![CI](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/ci.yml)
[![Release](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/release.yml)
[![Publish](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml/badge.svg)](https://github.com/yourname/vscode-i18n-translator-ext/actions/workflows/publish.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Status**: *Alpha*. Not yet ready for production use.

## Terminology

- `Source text` = The original text that you write in a source language you know
- `Target text` - The translated text for each language in a list of target languages

## Modes

- **VS Code Extension**: Integrate with VS Code IDE for a seamless translation experience
- **CLI Application**: Use as a command-line tool for CI/CD pipelines and automation

See [CLI Documentation](doc/CLI.md) for details on the command-line interface.

## Feature Roadmap

[x] = Completed | [W] = Work in progress | [ ] Not started

- [x] **Translate on Save** *as you save* source file it is instantly translated into a file for each target language.
  - [x] Markdown & MDX files
  - [x] JSON & YAML files
  - [ ] Can convert translated JSON to a JavaScript or TypeScript file.
- [x] **Back translation** from each target file back to a new file in the source language. This allow you to:
  - Check which source text was likely mistranslated by an AI engine - even when you can't read the target language.
  - View back translations in your application for any target language.
  - Revise & save source text file with alternative words or phrases and instantly re-check the new back translation for all target languages.
- [x] **Translation folder mirroring**
  - When a source folder is configured, changes to files in that folder are mirrored in all the target translation folders.
  - This ensures that files you create, rename or delete in the source folder are likewise created, renamed or deleted in all the target folders.
  - New or updated files are re-translated and then back translated in to all target folders.
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
- [W] **Contextual Translation** (DeepL, Gemini and OpenRouter). Status: *Experimental*. *Current implementation is likely to be revised*.
  - Problem: Translations of short strings common in user interfaces (like button labels) are often poorly translated by AI engines
  - Solution: Configure contextual information for keys in JSON and YAML files that provides contextual information included in prompts to LLM & DeepL APIs.
- [W] **Translation memory** (TM). We use a database of past translations that allows:
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

- [W] Configure and test GitHub Actions.

- [W] *Export & Push* your local TM database to a CAT service (like MateCat) and later *Pull & Import* the revisions back into you local project.
- [ ] Integrate [MateCat.com](https://matecat.com) translation service.

## MateCat integration

We plan to integrate this extension with an online Computer Aided Translation (CAT) service.
You'll be able to then treat your AI translations as _draft_ to be be reviewed and revised by a human translation team.

MateCat is an open source platform you can run in house for free or use their *free* cloud service for 200+ languages and dialects.
You can invite your own translators & reviewers or outsource to their professional translators.
MateCat has it's own leading edge AI tools and access to an 8 million phrase public TM dictionary used by big tech software companies.
You can maintain & backup your own private translation memory (TM) dictionary in MateCat or contribute to the public TM.
You can reuse your public or private translation memory to maintain consistent terminology and translation of terms across your future corporate projects.

## Configuration

The extension supports project-specific configuration through a `.translate.json` file in the root of your workspace or via your user and workspace settings.
See [Configuration Documentation](doc/Configuration.md) for details.

Configuration Options:
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

## API Keys

API keys for translation services are configured via environment variables that you can specify in `.translate.env` or in your operating system.
We avoiding using `.env.*` files so we don't interfere with your local project environment.
Ensure that the `.translate.env` file is excluded from GIT via your `.gitignore` file.

The first time you run the `Translator: Start` in a project, `.translate.env` will be created with placeholder text for your API keys.
It's name is also added to your project `.gitignore` file.

You only need to configure keys for the AI translation engines you plan to use.
You'll be warned if any required keys are missing or invalid.
See the configurations settings that select which AI services to use for each file type.

Example `.translate.env` file:

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

## License
MIT

