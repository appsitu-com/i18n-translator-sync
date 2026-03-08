# i18n Translator Sync

**Instant file translation with AI - multiple engines, smart caching, professional workflow**

<!-- TODO: Update MARKETPLACE_URL_PLACEHOLDER after publishing -->
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Install-blue.svg)](MARKETPLACE_URL_PLACEHOLDER)
[![Preview](https://img.shields.io/badge/Status-Preview-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<!-- [![CI](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml)
[![Release](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml)
[![Publish](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml) -->

Translate Markdown, MDX, JSON, YAML, and TypeScript files instantly as you save. Your translations stay in sync automatically with smart folder mirroring, translation memory, and support for Azure, Google, DeepL, and Gemini AI engines.

<!-- TODO: Add demo GIF here showing translation in action -->

**Quick Feature Overview:**
- ✅ **Instant translation** - Translates Markdown, MDX, JSON, YAML, and TypeScript files on save
- ✅ **Multiple AI engines** - Support for Azure, Google, DeepL, Gemini, and copy-only mode
- ✅ **Smart folder syncing** - Automatically mirrors file changes (create, rename, delete) to all target language folders
- ✅ **Translation memory** - SQLite-based translation database reduces costs and prevents translation drift
- ✅ **Back translations** - Translate target languages back to source to verify quality
- ✅ **Language-specific engines** - Override default engine per language for optimal results

## Installation

⚠️ **This extension is currently in Preview** - Features and configuration may change as we refine the user experience based on feedback.

**From VS Code Marketplace:**
<!-- TODO: Update MARKETPLACE_URL_PLACEHOLDER after publishing -->
[Install from VS Code Marketplace](MARKETPLACE_URL_PLACEHOLDER)

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

| Command                                 | Description                                                           |
| --------------------------------------- | --------------------------------------------------------------------- |
| `Translator: Start`                     | Starts the translation service. Starts watching source & config files |
| `Translator: Stop`                      | Stops the translation service                                         |
| `Translator: Restart`                   | Restarts the translation service                                      |
| `Translator: Export Cache to CSV`       | Exports the translation memory cache to a CSV file                    |
| `Translator: Import Cache from CSV`     | Imports translations from a CSV file into the cache                   |
| `Translator: Purge`                     | Removes all unused translations from translation cache                |
| `Translator: Purge Unused Translations` | Removes cache entries that are no longer referenced by source files   |
| `Translator: Show output`               | Opens the translator service output logs for debugging                |

## Instant Translation to Over 135 Languages

<!-- TODO: Add screenshot of multi-language translation in action -->

You can instantly translate **Markdown, MDX, JSON, YAML, YML, and TypeScript** files. Translation is triggered whenever you save a source language file so all your translated files remain "in sync" as you code.

- Use any of the languages supported by Google Translate, Azure Translate, DeepL or Gemini LLM
- Set a default translation engine for JSON/YAML/TS files or Markdown/MDX files
- Override your default engine by setting different engines for each locale

We found that Google Translate is often better at short text strings typically found in JSON/YAML/TS whereas Azure is often better at paragraphs and sentences found in Markdown/MDX files. DeepL is also best for European languages and supports `en-US` ⇒ `en-GB` translation.

## Source Language Neutral

You can choose to make any language your source language - it does not need to be English. However, be aware that many Translation APIs have been trained to translate best from English and may in fact translate from your source language to English and then to your target language. Some of the newer engines don't suffer from this issue.

See related info on [English and Translation Engines](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/NonEnglishSourceLanguage.md) .

## Target Naming

Source files and folder names must contain the source locale code (e.g., "en" for English).
To compute the file path for each target locale, the source file path must contain the target locale code.

Examples - Replacing 'en' (English) with 'fr' (French):
  - File: **en**-msg.json ⇒ **fr**-msg.json
  - Folder: **en**/messages.json ⇒ **fr**/messages.json

## Multiple Source Language Files and Folders

You can configure multiple files and folders containing the source text to be translated. The translation service will attempt to translate all supported file types in these source folders.

Being able to translate multiple source folder is very handy for projects like mono-repos that need to manage translated content in many places.

Source folders would normally only contain files you intend to translate but there is one useful exception - See [TypeScript i18n file translation](#typescript-i18n-file-translation) below.

## Smart Folder Syncing

Translated folders are kept "in sync" so if you rename or delete files in a source folder, the corresponding files will be renamed and deleted in all target folders. This is a **major time saver** when maintaining translated content and a key reason we developed this tool.

## Back Translations!

AI translations are admittedly "draft" translations but this feature can significantly improve your early MVP translation quality.

When you enable "back translation", each target language is translated back to the source language. This creates an additional translation file or folder per target locale that you can review to assess translation quality. You might even wish to add a developer mode switch in your apps, to view back translations inside your app.

Often tweaking your input source text can improve resulting translations. Using this feature, you can repeatedly adjust your input source text and instantly check back translations to assess resulting translation quality across all your target languages.

<!-- TODO: Add screenshot showing back translation comparison -->

## Translation Memory

The i18n Translator uses a **SQLite-based translation memory database** for professional translation workflows.
This is not just a performance cache - it's a foundational feature we'll develop for managing professional translations.

**Current capabilities:**
- **Reduces AI costs** - Only translates new or changed content
- **Prevents translation drift** - AI engines return different results each time; translation memory ensures consistency essential for proof checking
- **Fast lookups** - Instant retrieval of previously translated content
- **Persistent storage** - Translations survive across sessions and project updates
- **Purge unused entries** - Finds and removes unused translations
- **CSV export/import** - Export your translation cache => `translator.csv` and commit it to Git.
- **CSV export/import** - Import `translator.csv` pulled from Git into your translation cache.
- **Auto export** - If enabled, it can automatically reexport translation memory to CSV keeping it in sync with source text and new translations and Git commits.
- **Auto import** - If enabled, when a co-worker first pulls a CSV file from Git and runs "Translator: Start", this setting will auto import the CSV file into their new cache database

**Coming soon** (see [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md)):
- Integration with Computer-Assisted Translation (CAT) tools to convert your draft AI translations into production grade professional translations.

<!-- TODO: Add diagram showing translation memory workflow -->

## Locale Code Mapping

AI translation engines may use different locale codes so we support mapping your preferred locale code to the API's required codes.

Examples:

| Engine | Example Chinese codes |
| ------ | --------------------- |
| Google | `zh-CN`, `zh-TW`      |
| Azure  | `zh-Hans`, `zh-Hant`  |
| DeepL  | `ZH`, `ZH-TW`         |

See the "translators" > "langMap" in [translator.json](https://github.com/appsitu-com/i18n-translator-sync/blob/main/samples/translator.json) for examples of engine specific language code mapping.

_Did we get all the engine code mappings correct?_ If not, submit a PR with the correct mappings.

## Exclude Translation

You can exclude specific file names, keys or key paths from translation.
The next section on TypeScript translation demonstrates these features.

## TypeScript i18n File Translation

We support translation of TypeScript files that follow this specific format that is almost a JSON file. The `as const` is optional. We use the [JSON5](https://github.com/json5/json5) parser which accepts comments and strings with single or double quotes.

```ts
export default {
  /// JSON values
} as const
```

In this example, we translate a folder of TypeScript files that are merged together using an `index.ts` in the same folder.
We want to copy the `index.ts` file into each target folder - avoiding it being translated.
For a fully working example see our [test project](https://github.com/appsitu-com/i18n-translator-sync/blob/main/test-project).

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

1. Install the VSCode extension (see [Installation](#installation) above)
2. Run the Command `Translator: Start`

The first time you do this on a project, it will make these changes in the root folder of your project:
- Creates an example `translator.json` file that configures files & folders to be translated, languages & AI translation engine preferences
- Creates an example `translator.env` to configure your translation API keys. Contains instructions for getting API keys.
- Adds `translator.env` to `.gitignore` to exclude it from git. Creates `.gitignore` if it does not exist.

It will also open `translator.json` and `translator.env` so you can edit them:
- `translator.env` => Contains instructions and links to videos to help you setup your translation keys
- `translator.json` => See the [Configuration](#configuration) section below to learn how to configure this file

⚠️ **Important: If the server fails to start after editing config files**

The Translator may fail to auto-start if it finds invalid or missing values in `translator.json` or `translator.env`. If this happens:

1. Check the server logs: **VS Code Terminal** → **Output** → Select **"i18n Translator"** from the dropdown
2. Look for error messages about invalid JSON, missing required fields, or invalid API keys
3. See the [Troubleshooting](#troubleshooting) section below for common issues and solutions

**When the Translator service is running:**
- Whenever you update either `translator.json` or `translator.env`, the Translator will auto-restart and load your new settings
- Whenever you save a change to a source language file, the Translator will auto-translate and sync changes to all target languages
- If configured, it will also create "back translations" that translate each target file back to the original source language

## `translator.json` Configuration

See [Configuration Documentation](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/Configuration.md) for full details.

- Translation Engine codes:  `azure`, `google`, `deepl`, `gemini`, `copy`
- `copy` engine is just that. It won't translate anything. It just copies a file from source to target.

| Option                  | Type                       | Description                                                                             | Example                         |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `sourcePaths`           | `string[]`                 | Source language directories to scan for files to translate OR single source files       | `["i18n/en", "i18n/en.json"]`   |
| `sourceLocale`          | `string`                   | Source locale                                                                           | `"en"`                          |
| `targetLocales`         | `string[]`                 | Target locales to generate translations for                                             | `['fr-FR', 'fr-CA']`            |
| `enableBackTranslation` | `boolean`                  | Enable back translation                                                                 | `false`                         |
| `defaultMarkdownEngine` | `string`                   | Default engine for markdown & MDX files (azure, google, deepl, gemini, copy)            | `"azure"`                       |
| `defaultJsonEngine`     | `string`                   | Default engine for JSON, YAML, and YML files (azure, google, deepl, gemini, copy)       | `"google"`                      |
| `engineOverrides`       | `Record<string, string[]>` | Engine overrides for specific locales (forward translation).                            | `{"deepl": ["fr", "de"]}`       |
| `engineOverrides`       | `Record<string, string[]>` | Engine overrides for specific locales (back translation).                               | `{"azure": ["fr:en", "de:en"]}` |
| `excludeKeys`           | `string[]`                 | Key names to exclude from translation (copied unchanged). Matches at any nesting depth. | `["code", "native"]`            |
| `excludeKeyPaths`       | `string[]`                 | Exact dotted key paths to exclude from translation.                                     | `["meta.version"]`              |
| `copyOnlyFiles`         | `string[]`                 | File names (not paths) to copy verbatim instead of translating.                         | `["index.ts"]`                  |
| `csvExportPath`         | `string`                   | Path to cache CSV export/import file. Absolute or relative to workspace.                | `"translator.csv"`              |
| `autoExport`            | `boolean`                  | Automatically export cache to CSV after translation updates.                            | `true`                          |


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
Ensure that the `translator.env` file is excluded from GIT via your `.gitignore` file.

The first time you run the `Translator: Start` in a project, `translator.env` will be created with placeholder text for your API keys. It's name is also added to your project `.gitignore` file.

You only need to configure keys for the AI translation engines you plan to use.
You'll be warned if any required keys are missing or invalid.
See the configurations settings that select which AI services to use for each file type.

Example `translator.env` file:

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
