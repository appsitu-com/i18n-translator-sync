# Project Configuration

## .translate.json

The extension now supports a project-specific configuration file called `.translate.json` in the root of your workspace. This allows you to configure the translator without modifying VSCode settings.

### Example Configuration

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

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `sourcePaths` | `string[]` | Source language paths to scan for files to translate | `["i18n/en"]` |
| `sourceLocale` | `string` | Source locale | `"en"` |
| `targetLocales` | `string[]` | Target locales to generate translations for | `['fr-FR', 'fr-CA']` |
| `enableBackTranslation` | `boolean` | Enable back translation | `false` |
| `defaultMarkdownEngine` | `string` | Default engine for markdown files (azure, google, deepl, gemini, copy) | `"azure"` |
| `defaultJsonEngine` | `string` | Default engine for JSON files (azure, google, deepl, gemini, copy) | `"google"` |
| `engineOverrides` | `Record<string, string[]>` | Engine overrides for specific locales | `{"deepl": ["fr", "de"]}` |

## Backward Compatibility

For backward compatibility, the extension will still read from VSCode settings if no `.translate.json` file is found or if certain options are not specified in the file.

## Engine Overrides

The `engineOverrides` configuration allows you to specify which translation engine to use for specific language pairs. The key is the engine name, and the value is an array of locale patterns.

Example:
```json
"engineOverrides": {
  "deepl": ["fr", "de"],        // Use DeepL for French and German
  "azure": ["es:en", "ja:en"],   // Use Azure for Spanish->English and Japanese->English
  "gemini": ["zh-CN"]          // Use Gemini for Chinese
}
```

Each locale pattern can be either:
- A single locale code (e.g., "fr") - this will be used for both translations to and from the source locale
- A locale pair (e.g., "es:en") - this specifies a specific translation direction (Spanish to English)
