# i18n Translator SYNC - VS Code extension for instant file translation. Many AI engines & highly configurable.

<!-- [![CI](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/ci.yml)
[![Release](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/release.yml)
[![Publish](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml/badge.svg)](https://github.com/appsitu-com/i18n-translator-sync/actions/workflows/publish.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Can't wait to get started?*  Jump to the [Getting Started](#getting-started) section.

# Features

## Instant translation to over 135 languages

You can instantly translate Markdown/MDX, JSON, YAML/YML files and specific kinds of TypeScript files. Translation is triggered whenever you save a source language file so all your translated files remain "in sync" as you code.

- Use any of the languages support by Google Translate, Azure Translate, DeepL or Gemini LLM.
- Set a default translation engine for JSON/YAML/TS files or Markdown/MDX files
- Override your default engine by setting different engines for each locale.

We found that Google Translate is often better at short text strings typically found in JSON/YAML/TS whereas Azure is often better at paragraphs and sentences found in Markdown/MDX files. DeepL is also best for European languages and supports `en-US` => `en-UK` translation.

## Source language neutral

You can choose to make any language your source language - it does not need to be English.  However, be aware that many Translation APIs have been trained to translate best from English and may in fact translate from your source language to English and then to a target language.  Some of the newer engines don't suffer this issue.

## Target naming

Source files and folder names must contain the source locale code (e.g "en" for English).
To compute the file path for each target locale, the source file path must contain the target locale code.

Examples - Replacing 'en' (English) with 'fr' (French)
  - File: **en**-msg.json => **fr**-msg.json`
  - Folder: **en**/messages.json => **fr**/messages.json`

## Multiple source language files and folders

You can configure multiple source language files and folders. The translation service will attempt to translate all supported file types in all source language folders. This is very handy for mono-repo projects that need translated content in many places.

Source folders should normally only contain files you intend to translate with one exception - See [TypeScript](#TypeScript) below.

## Smart Folding syncing

Translated folders are kept "in sync" so if you rename or delete files in a source folder, the corresponding files will be renamed and deleted in all target folders. This is **major time saver** when maintaining translated content and key reason we developed this tool.

## Back translations!

You can enable back translation of each target language back to the source language. Now adjust your input source text and instantly check the back translations to assess translation quality. Add a developer mode switch to load back translations into your app.

AI translations are admittedly "draft" translations but this feature can significantly improve your early MVP translation quality.

## Translation memory

The i18 Translator remembers past translations and only calls AI Translation for new text values. This reduces AI translation costs and most importantly prevents constant changes as AI engines tend to return different results each time.

## Locale code mapping

AI translation engines may use different locale codes so we support mapping your preferred locale code to the API's required codes.

Examples:

| Engine | Example Chinese codes |
| ------ | --------------------- |
| Google | `zh-CN`, `zh-TW`      |
| Azure  | `zh-Hans`, `zh-Hant`  |
| DeepL  | `ZH`, `ZH-TW`         |

See the "translators" > "langMap" in [translator.json](https://github.com/appsitu-com/i18n-translator-sync/blob/main/samples/translator.json) for examples of engine specific language code mapping.

_Did we get all the engine code mappings correct?_ If not, submit a PR with the correct mappings.

## Exclude translation

You can exclude specific file names, keys or key paths from translation.
The next section on TypeScript translation demonstrates these features.

## TypeScript i18n file translation

We support translation of TypeScript files that follow a specific format that almost a JSON file. The `as const` is optional.

```ts
export default {
  /// JSON values
} as const
```

In this example, we translate a folder of TypeScript files that are merged together using an `index.ts` in the same folder.
We want to copy the `index.ts` file into each target folder but avoid it being translated.
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
"sourcePaths": ["i18n/en", "i18n/en.json"],
 "sourceLocale": "en",
 "targetLocales": ["en-US", "es", "fr", "hi", "ur", "de", "zh-CN"],
  ...
 "excludeKeys": ["native", "code"],  <<< Don't translate 'code' or 'native' values in locales.ts
 "copyOnlyFiles": ["index.ts"], <<< Don't translate the index.ts file
  ...
```

## What's missing?

Our [Roadmap](https://github.com/appsitu-com/i18n-translator-sync/blob/main/ROADMAP.md) includes some other exciting features.

# Getting Started

1. Install the VSCode extension
2. Run the Command `Translator: Start`

The first time you do this on project, it will make these changes in the root folder of your project:
- Creates an example `translator.json` file that configures files & folders to be translated, languages & AI translation engine preferences
- Creates an example `translator.env` to configure your translation API keys. Contains instructions for getting API keys.
- Adds `translator.env` to `.gitignore` to exclude it from git.  Creates `.gitignore` if it does not exist.

It will also open `translator.json` and `translator.env` so you can edit them.
- `translator.env` => Contains instructions and links to videos to help you setup your translation keys
- `translator.json` => See the [Configuration](#Configuration) section below to learn how to configure this file

When the Translator service is running ..
- Whenever you update either `translator.json` and `translator.env`, the Translator will auto restart and load your new settings.
- Whenever you save a change to a source language file, the Translator will auto translate and sync changes to all target languages.
- If configured, it will also create "back translations" that translate each target file back to the original source language.

## Diagnosing configuration issues

The Translator may fail to auto start if it find invalid or missing values in the `translator.json` and `translator.env` files. To diagnose restart issues:
- VSCode `Terminal` > `Output` > Select `i18n Translator` on the drop down list to view server logs.

## `translator.json` Configuration

See [Configuration Documentation](https://github.com/appsitu-com/i18n-translator-sync/blob/main/doc/Configuration.md) for full details.

- Translation Engine codes:  `azure`, `google`, `deepl`, `gemini`, `copy`
- `copy` engine is just that. It won't translate anything. It just copies a file from source to target.

| Option | Type | Description | Example |
|--------|------|-------------|---------|
| `sourcePaths` | `string[]` | Source language directories to scan for files to translate OR single source files | `["i18n/en", "i18n/en.json"]` |
| `sourceLocale` | `string` | Source locale | `"en"` |
| `targetLocales` | `string[]` | Target locales to generate translations for | `['fr-FR', 'fr-CA']` |
| `enableBackTranslation` | `boolean` | Enable back translation | `false` |
| `defaultMarkdownEngine` | `string` | Default engine for markdown & MDX files (azure, google, deepl, gemini, copy) | `"azure"` |
| `defaultJsonEngine` | `string` | Default engine for JSON, YAML, and YML files (azure, google, deepl, gemini, copy) | `"google"` |
| `engineOverrides` | `Record<string, string[]>` | Engine overrides for specific locales | `{"deepl": ["fr", "de"]}` |
| `excludeKeys` | `string[]` | Key names to exclude from translation (copied unchanged). Matches at any nesting depth. | `[]` |
| `excludeKeyPaths` | `string[]` | Exact dotted key paths to exclude from translation (e.g. `"meta.version"`). | `[]` |
| `copyOnlyFiles` | `string[]` | File names (not paths) to copy verbatim instead of translating (e.g. `"index.ts"`). | `[]` |


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
  "copyOnlyFiles": ["index.ts"]
}
```

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

## For AI Agents & Contributors

**Important**: If you're an AI agent or developer working on this project, please read [`.github/copilot-instructions.md`](https://github.com/appsitu-com/i18n-translator-sync/blob/main/.github/copilot-instructions.md) for essential coding conventions, architectural decisions, and project-specific guidelines.


## Contact
- For questions or issues, refer to the GitHub repository:
  - https://github.com/appsitu-com/i18n-translator-sync

## License

MIT - *Enjoy!*
