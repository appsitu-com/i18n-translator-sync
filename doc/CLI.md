# CLI for i18n Translator

The i18n Translator package can be used both as a VSCode extension and as a command-line interface (CLI) tool. This document explains how to install and use the CLI version.

## Installation

### Global Installation

To install the CLI globally:

```bash
npm install -g i18n-translator-sync
```

Or using pnpm:

```bash
pnpm add -g i18n-translator-sync
```

### Local Installation

To install in your project:

```bash
npm install --save-dev i18n-translator-sync
```

Or using pnpm:

```bash
pnpm add -D i18n-translator-sync
```

## Usage

The CLI uses a single command with flags.

```bash
i18n-translator [workspace] [options]
```

- `workspace`: Optional path to the workspace root. Defaults to the current directory.

### Core Options

- `--config <path>`: Path to a custom config file (defaults to `<workspace>/translator.json`).
- `--watch`: Run in watch mode (default behavior).
- `--no-watch`: Disable watch mode.
- `--bulk-translate`: Run one bulk translation pass and exit.
- `--force`: Force translation even when targets appear up to date.

### Cache Options

- `--export-cache [path]`: Export cache to CSV and exit.
- `--import-cache <path>`: Import cache from CSV and exit.
- `--purge-cache`: Purge unused cache entries and exit.

Execution precedence when multiple action flags are supplied:

1. `--export-cache`
2. `--import-cache`
3. `--purge-cache`
4. `--bulk-translate`
5. watch mode (`--watch` / default)

## Configuration

The CLI uses the same configuration as the VSCode extension. You need to create a `translator.json` file in your project root with the following structure:

```json
{
  "sourcePaths": ["i18n/en", "docs/en"],
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de", "ja", "zh-CN"],
  "enableBackTranslation": true,
  "defaultMarkdownEngine": "auto",
  "defaultJsonEngine": "auto",
  "engineOverrides": {
    "auto": ["en:ja", "en:ko"],
    "deepl": ["fr", "de"],
    "azure": ["es:en", "ja:en"],
    "gemini": ["zh-CN"]
  }
}
```

Valid engine codes for `defaultMarkdownEngine`, `defaultJsonEngine`, and `engineOverrides` keys are:
`azure`, `google`, `deepl`, `gemini`, `copy`, `auto`.

When using `auto`, locales are normalized (`fr-FR` -> `fr`, `pt-BR` -> `pt`) before selecting the engine.

Auto routing behavior:
- `deepl` for targets: `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt`, `ru`
- `google` for targets: `zh`, `ja`, `ko`, `th`, `vi`, `ar`, `hi`
- for all other targets: `azure` for markdown/MDX, `google` for JSON/YAML/TypeScript

You can scope `auto` to specific locale pairs by using `"auto"` in `engineOverrides`, for example:

```json
"engineOverrides": {
  "auto": ["en:ja", "en:ko"],
  "deepl": ["fr", "de"]
}
```

You also need to set up your API keys in a `translator.env` file:

```ini
# Azure Translation API configuration
AZURE_TRANSLATION_KEY='your-key'
AZURE_TRANSLATION_REGION='westus'
AZURE_TRANSLATION_URL='https://api.cognitive.microsofttranslator.com'

# Google Translate API configuration (v3)
# GOOGLE_TRANSLATION_KEY is a path to a Google service credential JSON file
GOOGLE_TRANSLATION_KEY='.translator/google-service-account.json'
GOOGLE_TRANSLATION_URL='https://translation.googleapis.com'
GOOGLE_TRANSLATION_PROJECT_ID='your-google-cloud-project-id'
GOOGLE_TRANSLATION_LOCATION='global'

# DeepL API configuration
DEEPL_TRANSLATION_KEY='your-key'
DEEPL_TRANSLATION_URL='https://api-free.deepl.com'

# Gemini AI API configuration
GEMINI_API_KEY='your-key'
```

### Path Resolution Rules

- The workspace root is the `workspace` argument (or current directory when omitted).
- `translator.env` is loaded from the workspace root.
- By default, `translator.json` is loaded from `<workspace>/translator.json`.
- If `--config <path>` is provided, that file is used for all config parsing paths in CLI mode.
- Relative paths in config and translator engine settings are resolved from the workspace root.

## Examples

### Watch Mode (Default)

```bash
# Start watching in the current directory
i18n-translator

# Start watching a specific workspace directory
i18n-translator /path/to/project

# Start with a custom config file
i18n-translator /path/to/project --config ./configs/translator.staging.json
```

### One-time Translation

```bash
# Run bulk translation once and exit
i18n-translator /path/to/project --bulk-translate

# Force full re-translation and exit
i18n-translator /path/to/project --bulk-translate --force
```

### Cache Operations

```bash
# Export cache to default CSV path from config
i18n-translator /path/to/project --export-cache

# Export cache to a specific CSV path
i18n-translator /path/to/project --export-cache ./cache/translations.csv

# Import cache
i18n-translator /path/to/project --import-cache ./cache/translations.csv

# Purge unused cache entries
i18n-translator /path/to/project --purge-cache
```

## Integration with NPM Scripts

You can add these commands to your `package.json` scripts:

```json
{
  "scripts": {
    "translate:watch": "i18n-translator .",
    "translate:bulk": "i18n-translator . --bulk-translate",
    "translate:force": "i18n-translator . --bulk-translate --force",
    "translate:export-cache": "i18n-translator . --export-cache"
  }
}
```

Then run them with:

```bash
npm run translate:watch
npm run translate:bulk
npm run translate:force
npm run translate:export-cache
```

Or with pnpm:

```bash
pnpm translate:watch
pnpm translate:bulk
pnpm translate:force
pnpm translate:export-cache
```