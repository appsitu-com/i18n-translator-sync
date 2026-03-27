# i18n Translator Sync

**Instant file translation with AI - multiple engines, smart caching, professional workflow**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Install-blue.svg)](https://marketplace.visualstudio.com/items?itemName=AppSitu.i18n-translator-sync)
[![Preview](https://img.shields.io/badge/Status-Preview-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<!-- [![CI](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml)
[![Release](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml)
[![Publish](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml) -->

Translate Markdown, MDX, JSON, YAML, and TypeScript files instantly as you save. Your translations stay in sync automatically with smart folder mirroring, translation memory, and support for Azure, Google, DeepL, and Gemini engines, including an `auto` router mode.

<!-- TODO: Add demo GIF here showing translation in action -->

**Quick Features Overview:**
- ✅ **Instant translation** - Translates Markdown, MDX, JSON, YAML, and TypeScript files on save
- ✅ **Multiple AI engines** - Supports Azure, Google, DeepL, Gemini, `auto` routing, and copy-only mode.
- ✅ **NLLB AI engine** - Supports NLLB translation engine. License permits non-commercial use only.
- ✅ **Smart folder syncing** - Automatically mirrors file changes (create, rename, delete) to all target language folders
- ✅ **Translation memory** - SQLite-based translation database reduces costs and prevents translation drift
- ✅ **Back translations** - Translate target languages back to source to verify quality
- ✅ **Language-specific engines** - Override default engine per language for optimal results

## Installation

⚠️ **This extension is currently in Preview** - Features and configuration may change as we refine the user experience based on feedback.

**From VS Code Marketplace:**
[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AppSitu.i18n-translator-sync)

**From VS Code:**
1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac) to open Extensions
3. Search for "i18n Translator Sync"
4. Click Install

**Requirements:**
- VS Code version 1.109.5 or higher

*Can't wait to get started?* Jump to the [Getting Started](#getting-started) section.

# Features

## Visual Studio Code Commands

| Command                                          | Description                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `Translator: Start`                              | Starts the translation service. Starts watching source & config files |
| `Translator: Stop`                               | Stops the translation service                                         |
| `Translator: Restart`                            | Restarts the translation service                                      |
| `Translator: Export translation memory to CSV`   | Exports the translation memory database to a CSV file                 |
| `Translator: Import translation memory from CSV` | Imports translations from a CSV file into the TM database             |
| `Translator: Purge`                              | Removes all unused translations from translation cache                |
| `Translator: Show output`                        | Opens the translator service output logs for debugging                |

## CLI Quick Reference

The CLI uses a single command form:

```bash
i18n-translator [workspace] [options]
```

- `workspace` defaults to the current directory.
- `--config <path>` selects a custom translator config file.
- `--bulk-translate` runs one translation pass and exits.
- `--watch` (default) runs continuously; `--no-watch` disables watching.
- `--force` forces translation even when targets look up to date.

Common commands:

```bash
# watch mode (default)
i18n-translator .

# one-time bulk translation
i18n-translator . --bulk-translate

# force full re-translation
i18n-translator . --bulk-translate --force

# cache operations
i18n-translator . --export-cache
i18n-translator . --import-cache ./translator.csv
i18n-translator . --purge-cache
```

For complete CLI details, see [doc/CLI.md](doc/CLI.md).

## Instant Translation to Over 135 Languages

<!-- TODO: Add screenshot of multi-language translation in action -->

You can instantly translate **Markdown, MDX, JSON, YAML, YML, and TypeScript** files. Translation is triggered whenever you save a source language file so all your translated files remain "in sync" as you code.

- Use any of the languages supported by Google Translate, Azure Translate, DeepL or Gemini LLM
- Set a default translation engine for JSON/YAML/TS files or Markdown/MDX files
- Override your default engine by setting different engines for each locale

We found that Google Translate is often better at short text strings typically found in JSON/YAML/TS whereas Azure is often better at paragraphs and sentences found in Markdown/MDX files. DeepL is also best for European languages and supports `en-US` ⇒ `en-GB` translation.

## Source Language Neutral

You can choose any language as your source language - it does not need to be English. However, be aware that many Translation APIs have been trained to translate best from English and may translate from your source language to English, then to your target language. Some of the newer engines do not suffer from this issue.

See related info on [English and Translation Engines](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/NonEnglishSourceLanguage.md).

## Source file & folder names

Source files and folder names must contain the source locale code (e.g., "en" for English). This is used to compute the file path for each target locale.

### Examples - Replacing 'en' (English) with 'fr' (French):
  - File: **en**-msg.json ⇒ **fr**-msg.json
  - Folder: **en**/messages.json ⇒ **fr**/messages.json

## Multiple Source Language Files and Folders

You can configure multiple files and folders containing the source text to be translated. The translation service will attempt to translate all supported file types in these source folders.

Being able to translate multiple source folders is very handy for projects like mono-repos that need to manage translated content in many places.

Source folders would normally only contain files you intend to translate but there is one useful exception - See [TypeScript i18n file translation](#typescript-i18n-file-translation) below.

### Example `translator.json` configuration

- where `packages` are subprojects and `sourcePaths` are your source language folders and files.

`sourcePaths: ["packages/app/i18n/en", "packages/api/app/i18n/en.json", "packages/content/markdown/en/" ]`
- `"packages/app/i18n/en"` => Translates English source folder in your front-end application.
- `"packages/api/i18n/en.json"` => Translates JSON files in this folder from your backend API.
- `"packages/content/markdown/en/"` => Translates markdown content files

This will generate translated files replacing `en` with each of your target locales.

- `targetLocales: ["fr", "zh-Hans", "ar"]` will translate to French, Chinese (Simplified) and Arabic.

**Example:**
- `"packages/app/i18n/fr"` => **French** for front-end application.
- `"packages/api/i18n/fr.json"` => **French** JSON files for backend API.
- `"packages/content/markdown/fr/"` => **French** markdown content files

## Smart Folder Syncing

Translated folders are kept "in sync" so if you rename or delete files in a source folder, the corresponding files will be automatically renamed and deleted in all target folders. This is a **major time saver** when maintaining translated content and a key reason we developed the "i18n Translation **Sync**" tool.

## Back Translations!

AI translations are admittedly "draft" translations but this feature can significantly improve your early MVP translation quality.
When you enable "back translation", each target language is translated back to the source language. This creates an additional translation file or folder per target locale that you can review to assess translation quality.

### Setting `enableBackTranslation: true` in `translator.json` will generate back translations:

**Example:**
- `"packages/app/i18n/en` => Original English source text.
- `"packages/app/i18n/fr"` => Forward translation English => French.
- `"packages/app/i18n/fr_en"` => _Back translation_ of **English => French => English** to compare with original English text.

So enabling this feature is like adding a new locale code `fr_en` to your system.

Back translation will by default use the same engine used for forward translation but you can override this by specifying a source and target language pair (e.g. "en:ja") in the `engineOverrides` rules. See example below.

### Using back translation to improve the AI translation quality

Tweaking your input source text can often significantly improve AI translation quality as you find terms that are less ambiguous to the AI engine. Using this feature, you can iteratively adjust input source text and instantly check the back translations to assess translation quality across all your target languages.

> 💡 Idea: Add a `back translation` switch for software developers to display back translations inside your app.

<!-- TODO: Add screenshot showing back translation comparison -->

## Translation Memory

The i18n Translator stores translations in a local **translation memory database**. This not only boosts performance - it's a foundational feature we'll eventually develop to integrate with professional human translation services.

**Current capabilities:**
- **Reduces AI costs** - Only translates new or changed content
- **Prevents translation drift** - AI engines return different results each time; translation memory ensures consistency essential for proof checking
- **Fast lookups** - Instant retrieval of previously translated content
- **Persistent storage** - Translations survive across sessions and project updates
- **Purge unused entries** - Finds and removes unused translations
- **CSV export/import** - Export your translation cache => `translator.csv` and commit it to Git.
- **CSV export/import** - Import `translator.csv` pulled from Git into your translation cache.
- **Auto export** - If enabled, it can automatically re-export translation memory to CSV, keeping it in sync with source text, new translations, and Git commits.
- **Auto import** - If enabled, when a co-worker first pulls a `translator.csv` file from Git and runs "Translator: Start", this setting will it's auto imported into their "translation memory" database. This is important to ensure your software team maintains consistent translations.

**Coming soon** (see [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md)):
- Integration with a professional human translation service to review and revise your AI translations. These update will be retained in your local "translation mem"

<!-- TODO: Add diagram showing translation memory workflow -->

## Exclude Translation

You can exclude specific file names, keys or key paths from translation.
The next section on TypeScript translation demonstrates these features.

Examples:
- `"excludeKeys": ["native", "code"]` => In JSON and YAML files, don't translate `'code'` or `'native'` fields.
- `"copyOnlyFiles": ["index.ts"]` =>  When `index.ts` files exist in a source folder, just copy them to all target folders - don't translate them.

## Locale Code Mapping

AI translation engines may use different locale codes than those used by your app, so we support mapping your preferred locale codes to the API's required codes using a `langMap` setting in `translator.json` for each AI engine.

See the "translators" > "langMap" in [translator.json](https://github.com/appsitu-com/i18n-translator-sync/blob/main/samples/translator.json) for examples of engine-specific language code mapping.

_Did we get all the engine code mappings correct?_ If not, submit a PR with the correct mappings.

Examples:

| Engine | Engine Required codes |
| ------ | --------------------- |
| Google | `zh-CN`, `zh-TW`      |
| Azure  | `zh-Hans`, `zh-Hant`  |
| DeepL  | `ZH`, `ZH-TW`         |

- `"zh-Hans": "zh-CN"`  -- Maps the code used by your app (`zh-Hans`) => Code required by AI engine (`zh-CN`).

```json
 "translator": {
    "copy": {},
    "google": {
      ...
      "langMap": {
        "zh-Hans": "zh-CN",  // Code used by your app => Code required by AI engine
        "zh-Hant": "zh-TW",
        "zh-HK": "zh-TW",
      }
    },
    "azure": {
      ...
      "langMap": {
        "zh-CN": "zh-Hans",
        "zh-TW": "zh-Hant",
        "zh-HK": "zh-Hant"
      }
    },
    "deepl": {
      ...
      "langMap": {
        "zh-Hans": "ZH",
        "zh-Hant": "ZH-TW",
        "zh-HK": "ZH-TW",
      }
    }
  }
```


## TypeScript i18n File Translation

We support translation of TypeScript files that follow a specific format that is almost JSON. The `as const` is optional. We use the [JSON5](https://github.com/json5/json5) parser, which accepts comments and strings delimited either single or double quotes.

```ts
export default {
  /// JSON values
} as const
```

In this example, we translate a folder of TypeScript files that are merged using an `index.ts` file in the same folder.
We want to copy the `index.ts` file into each target folder, avoiding translation.
For a fully working example, see our [test project](https://github.com/appsitu-com/i18n-translator-sync/blob/main/test-project).

`i18n/en/index.ts`
```ts
import locales from './locales.ts'
import messages from './messages.ts'

export default {
  ...messages,
  locales
} as const
```

`i18n/en/messages.ts`
```ts
export default {
  "greeting": "Hello, World!",
  ...
} as const
```

`i18n/en/locales.ts`
```ts
export default [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' }
] as const
```

`translator.json`
```json
"sourcePaths": ["i18n/en"],  <<< translate files in the i18n/en/ folder
 "sourceLocale": "en",       <<< Translate from English
 "targetLocales": ["en-US", "es", "fr", "hi", "ur", "de", "zh-CN"], <<< Translate to folders: i18n/en-US/, i18n/es/ ... i18n/zh-CN/
  ...
 "excludeKeys": ["native", "code"],  <<< Don't translate 'code' or 'native' values in locales.ts
 "copyOnlyFiles": ["index.ts"], <<< Don't translate the index.ts file
  ...
```

## What's missing?

Our [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md) includes some other exciting features.

# Getting Started

1. Install the VS Code extension (see [Installation](#installation) above)
2. Run the command `Translator: Start`

The first time you do this on a project, it will make these changes in the root folder of your project:
- Creates an example `translator.json` file that configures files & folders to be translated, languages & AI translation engine preferences
- Creates an example `translator.env` to configure your translation API keys. Contains instructions for getting API keys.
- Adds `translator.env` to `.gitignore` to exclude it from git. Creates `.gitignore` if it does not exist.

It will also open `translator.json` and `translator.env` so you can edit them:
- `translator.env` => Contains instructions and links to videos to help you set up your translation keys
- `translator.json` => See the [Configuration](#configuration) section below to learn how to configure this file

⚠️ **Important: If the server fails to start after editing config files**

The Translator may fail to auto-start if it finds invalid or missing values in `translator.json` or `translator.env`. If this happens:

1. Check the server logs:
  - Simplest: click "Translator" on the very bottom bar in VSCode and choose "Show Output" from the menu.
  - Otherwise: **VS Code Terminal** → **Output** tab → Select **"i18n Translator"**
3. Look for error messages about invalid JSON, missing required fields, or invalid API keys
4. See the [Troubleshooting](#troubleshooting) section below for common issues and solutions

**When the Translator service is running:**
- Whenever you update either `translator.json` or `translator.env`, the Translator will auto-restart and load your new settings
- Whenever you save a change to a source language file, the Translator will auto-translate and sync changes to all target languages
- If configured, it will also create "back translations" that translate each target file back to the original source language

## `translator.json` Configuration

See [Configuration Documentation](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/Configuration.md) for full details.
See [Supported Languages Matrix](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/SupportedLanguages.md) for engine-by-engine language codes.

- Translation Engine codes:  `azure`, `google`, `deepl`, `gemini`, `openrouter`, `nllb`, `copy`, `auto`
- `copy` engine is just that. It won't translate anything. It just copies a file from source to target.
- `auto` chooses an engine from the locale pair and document type using normalized locale codes:
  - `deepl` for targets `de|fr|es|it|nl|pl|pt|ru`;
  - `google` for targets `zh|ja|ko|th|vi|ar|hi`;
  - for other targets: `azure` for markdown/MDX and `google` for structured files (JSON/YAML/TS).
  - Locale variants such as `fr-FR` or `pt-BR` are supported.
- `auto` can be used in defaults and in overrides. For overrides, use `"auto"` as the `engineOverrides` key.

| Option                  | Type                       | Description                                                                                               | Example                                      |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sourcePaths`           | `string[]`                 | Source language directories to scan for files to translate OR single source files                         | `["i18n/en", "i18n/en.json"]`                |
| `sourceLocale`          | `string`                   | Source locale                                                                                             | `"en"`                                       |
| `targetLocales`         | `string[]`                 | Target locales to generate translations for                                                               | `['fr-FR', 'fr-CA']`                         |
| `enableBackTranslation` | `boolean`                  | Enable back translation                                                                                   | `false`                                      |
| `defaultMarkdownEngine` | `string`                   | Default engine for markdown & MDX files (azure, google, deepl, gemini, openrouter, nllb, copy, auto)      | `"azure"`                                    |
| `defaultJsonEngine`     | `string`                   | Default engine for JSON, YAML, and YML files (azure, google, deepl, gemini, openrouter, nllb, copy, auto) | `"google"`                                   |
| `engineOverrides`       | `Record<string, string[]>` | Overrides default engine key for a locale or locale-pair.                                                 | `{"auto": ["en:ja"], "deepl": ["fr", "de"]}` |
| `excludeKeys`           | `string[]`                 | Key names to exclude from translation (copied unchanged). Matches at any nesting depth.                   | `["code", "native"]`                         |
| `excludeKeyPaths`       | `string[]`                 | Exact dotted key paths to exclude from translation.                                                       | `["meta.version"]`                           |
| `copyOnlyFiles`         | `string[]`                 | File names (not paths) to copy verbatim instead of translating.                                           | `["index.ts"]`                               |
| `csvExportPath`         | `string`                   | Path to cache CSV export/import file. Absolute or relative to workspace.                                  | `"translator.csv"`                           |
| `autoExport`            | `boolean`                  | Automatically export cache to CSV after translation updates.                                              | `true`                                       |


Example `translator.json`:
```json
{
  "sourcePaths": ["i18n/en", "docs/en"],
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de", "ja", "zh-CN"],
  "enableBackTranslation": true,
  "defaultMarkdownEngine": "azure",  // Applied to MDX and Markdown files
  "defaultJsonEngine": "google", // Applied to JSON/YAML and TypeScript (export default {... })
  "engineOverrides": {
    "auto": ["en:ja", "en:ko"],
    "deepl": ["fr", "de"],
    "azure": ["es:en", "ja:en"],
    "gemini": ["zh-CN"]
  },
  "excludeKeys": ["_comment"],
  "excludeKeyPaths": ["meta.version"],
  "copyOnlyFiles": ["index.ts"],
  "csvExportPath": "translator.csv",
  "autoExport": true
}
```

## Cache Purge

Use purge to remove stale cache rows that are no longer referenced by active source files.

**VS Code**
- Command Palette: `Translator: Purge Unused Translations`
- Context menu: `Purge Unused Translations`

**CLI**
```bash
i18n-translator <workspace> --purge-cache
```

Purge workflow:
1. Creates a timestamped CSV backup when the export file exists (e.g. `translator-20260305-1420.csv`)
2. Marks all cached rows as unused
3. Retranslates project source files to mark active rows as used
4. Deletes rows still marked unused
5. Auto-exports updated cache when `autoExport` is enabled

## Setting API Keys

API keys for translation services are configured via environment variables that you can specify in `translator.env` or in your operating system. We avoided using `.env.*` files so we don't interfere with your local project environment.
Ensure that the `translator.env` file is excluded from Git via your `.gitignore` file.

The first time you run the `Translator: Start` in a project, `translator.env` will be created with placeholder text for your API keys. Its name is also added to your project `.gitignore` file.

You only need to configure keys for the AI translation engines you plan to use.
You'll be warned if any required keys are missing or invalid.
See the configuration settings that select which AI services to use for each file type.

Example `translator.env` file:

```ini
# Azure Translation API configuration
# Get API key from: https://learn.microsoft.com/azure/ai-services/translator/translator-how-to-signup
AZURE_TRANSLATION_KEY='XXXXXXXXXXXXXXXXX'
AZURE_TRANSLATION_REGION='westus'
AZURE_TRANSLATION_URL='https://api.cognitive.microsofttranslator.com'

# Google Translate API configuration (v3)
# Create a service account JSON key file:
# GOOGLE_TRANSLATION_KEY is a path to a Google service credential JSON file
GOOGLE_TRANSLATION_KEY='.translator/google-service-account.json'
GOOGLE_TRANSLATION_URL='https://translation.googleapis.com'
GOOGLE_TRANSLATION_PROJECT_ID='your-google-cloud-project-id'
GOOGLE_TRANSLATION_LOCATION='global'

# DeepL API configuration
# Get API key from: https://www.deepl.com/pro-api
DEEPL_TRANSLATION_KEY='XXXXXXXXXXXXXXXXXXXXX'
DEEPL_TRANSLATION_URL='https://api-free.deepl.com'

# Gemini AI API configuration
# Get API key from: https://ai.google.dev/tutorials/setup
GEMINI_API_KEY='XXXXXXXXXXXXXXXXXXXXX'

# Hugging Face API configuration
# Get API key from: https://huggingface.co/settings/tokens
# NLLB can use Hugging Face Inference API with facebook/nllb-200-1.3B
# NLLB's license prohibits commercial use.
HUGGINGFACE_API_KEY='hf_XXXXXXXXXXXXXXXXXXXXX'
HUGGINGFACE_API_URL='https://api-inference.huggingface.co/models/facebook/nllb-200-1.3B'

```

## Troubleshooting

### Server Won't Start or Keeps Restarting

**How to check logs:**
1. Open VS Code Terminal
2. Click the **Output** tab
3. Select **"i18n Translator"** from the dropdown menu on the right
4. Review log messages for errors

**Common issues:**

**Invalid JSON in config files**
- Error: `Unexpected token` or `JSON parse error`
- Solution: Validate your `translator.json` file syntax. Use VS Code's built-in JSON validator or an online JSON formatter
- Common mistakes: Missing commas, trailing commas, unquoted keys

**Missing required configuration**
- Error: `sourcePaths is required` or `sourceLocale is required`
- Solution: Ensure `translator.json` includes all required fields: `sourcePaths`, `sourceLocale`, `targetLocales`

**Invalid API keys**
- Error: `Authentication failed` or `Invalid API key`
- Solution: Check your `translator.env` file and verify:
  - API keys are copied correctly (no extra spaces or quotes)
  - URLs are correct for your service tier (e.g., DeepL free vs pro)
  - API keys are active and have quota remaining

**Invalid locale codes**
- Error: `Unsupported language code`
- Solution: Different engines support different locale codes. Check your engine's documentation or use locale mapping in `translator.json`

### File Watcher Not Triggering Translations

**Files not translating when saved:**
- Verify the Translator service is running (check Output logs)
- Ensure the file is in a configured `sourcePaths` directory
- Check file extension is supported (`.md`, `.mdx`, `.json`, `.yaml`, `.yml`, `.ts`)
- For TypeScript files, verify the file matches the `export default { ... }` pattern

### Translation Quality Issues

**Poor translations for short strings:**
- Try different engines - Google and Azure often work better for UI strings than Gemini
- Consider using DeepL for European languages

**Translations keep changing:**
- This indicates translation memory isn't working
- Check the cache database is being created (look for `.sqlite` files)
- Verify file permissions allow writing to the cache directory

### Need More Help?

- Check the [Configuration Documentation](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/Configuration.md)
- Review the [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md) for known limitations
- Search or create an issue on [GitHub Issues](https://github.com/appsitu-com/i18n-translator-sync/issues)

## For AI Agents & Contributors

**Important**: If you're an AI agent or developer working on this project, please read [`.github/copilot-instructions.md`](https://github.com/appsitu-com/i18n-translator-sync/blob/main/.github/copilot-instructions.md) for essential coding conventions, architectural decisions, and project-specific guidelines.

## Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding new features, your help is appreciated.

**Getting started:**
- Read [CONTRIBUTING.md](https://github.com/appsitu-com/i18n-translator-sync/blob/main/CONTRIBUTING.md) for development setup and guidelines
- Review [`.github/copilot-instructions.md`](https://github.com/appsitu-com/i18n-translator-sync/blob/main/.github/copilot-instructions.md) for coding conventions
- Check [GitHub Issues](https://github.com/appsitu-com/i18n-translator-sync/issues) for open tasks
- See the [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md) for planned features

**Types of contributions we need:**
- Bug fixes and issue reports
- Documentation improvements
- New translation engine integrations
- Performance optimizations
- Feature suggestions and implementations

## Contact
- For questions or issues, refer to the GitHub repository:
  - https://github.com/appsitu-com/i18n-translator-sync

## License

MIT - *Enjoy!*
