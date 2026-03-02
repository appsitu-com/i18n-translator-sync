# CLI for i18n Translator

The i18n Translator package can be used both as a VSCode extension and as a command-line interface (CLI) tool. This document explains how to install and use the CLI version.

## Installation

### Global Installation

To install the CLI globally:

```bash
npm install -g i18n-translator-vscode
```

Or using pnpm:

```bash
pnpm add -g i18n-translator-vscode
```

### Local Installation

To install in your project:

```bash
npm install --save-dev i18n-translator-vscode
```

Or using pnpm:

```bash
pnpm add -D i18n-translator-vscode
```

## Usage

The CLI provides three main commands:

### Start Watching

Start watching for changes in the source files and automatically translate them:

```bash
i18n-translator start [options]
```

Options:
- `-c, --config <path>`: Path to config file (translator.json) (default: "translator.json")
- `-w, --workspace <path>`: Path to workspace root (default: current directory)
- `-v, --verbose`: Enable verbose logging

This will start a file watcher that monitors your source files and translates them when they change. Press Ctrl+C to stop the watcher.

### Push Translations

Push translations to target languages:

```bash
i18n-translator push [options]
```

Options:
- `-c, --config <path>`: Path to config file (translator.json) (default: "translator.json")
- `-w, --workspace <path>`: Path to workspace root (default: current directory)
- `-v, --verbose`: Enable verbose logging

### Pull Translations

Pull translations from source:

```bash
i18n-translator pull [options]
```

Options:
- `-c, --config <path>`: Path to config file (translator.json) (default: "translator.json")
- `-w, --workspace <path>`: Path to workspace root (default: current directory)
- `-v, --verbose`: Enable verbose logging

## Configuration

The CLI uses the same configuration as the VSCode extension. You need to create a `translator.json` file in your project root with the following structure:

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

You also need to set up your API keys in a `translator.env` file:

```ini
# Azure Translation API configuration
AZURE_TRANSLATION_KEY='your-key'
AZURE_TRANSLATION_REGION='westus'
AZURE_TRANSLATION_URL='https://api.cognitive.microsofttranslator.com'

# Google Translate API configuration
GOOGLE_TRANSLATION_KEY='your-key'
GOOGLE_TRANSLATION_URL='https://translation.googleapis.com'

# DeepL API configuration
DEEPL_TRANSLATION_KEY='your-key'
DEEPL_TRANSLATION_URL='https://api-free.deepl.com'

# Gemini AI API configuration
GEMINI_API_KEY='your-key'
```

## Examples

### Watch Mode

```bash
# Start watching in the current directory
i18n-translator start

# Start watching in a specific directory with verbose output
i18n-translator start -w /path/to/project -v

# Start with a custom config file
i18n-translator start -c custom-config.json
```

### One-time Translations

```bash
# Push translations for all files
i18n-translator push

# Pull translations with verbose output
i18n-translator pull -v
```

## Integration with NPM Scripts

You can add these commands to your `package.json` scripts:

```json
{
  "scripts": {
    "translate:watch": "i18n-translator start",
    "translate:push": "i18n-translator push",
    "translate:pull": "i18n-translator pull"
  }
}
```

Then run them with:

```bash
npm run translate:watch
npm run translate:push
npm run translate:pull
```

Or with pnpm:

```bash
pnpm translate:watch
pnpm translate:push
pnpm translate:pull
```