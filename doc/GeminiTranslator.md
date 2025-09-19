# Gemini Translator

The VS Code i18n Translator extension now supports Google's Gemini as a translation engine.

## Features

- Uses Google's Gemini AI models for high-quality translations
- Context-aware translations - uses any provided context for better accuracy
- Supports customization of temperature and max output tokens
- Handles batch processing to optimize translation requests

## Configuration

### In VS Code Settings

Add the Gemini API key and optional configuration parameters to your VS Code settings:

```json
"translator.gemini": {
  "key": "YOUR_GEMINI_API_KEY",
  "endpoint": "https://generativelanguage.googleapis.com/v1beta",
  "geminiModel": "gemini-1.5-pro",
  "temperature": 0.1,
  "maxOutputTokens": 1024
}
```

For better security, use environment variables:

```json
"translator.gemini": {
  "key": "env:GEMINI_API_KEY"
}
```

### In .translator.json

You can also configure the Gemini translator in your project's `.translator.json` file:

```json
{
  "sourcePaths": ["i18n/en"],
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de", "ja"],
  "enableBackTranslation": true,
  "defaultMarkdownEngine": "gemini",
  "defaultJsonEngine": "gemini",
  "engineOverrides": {
    "google": ["zh"],
    "deepl": ["de", "fr"]
  }
}
```

## Setting Up

1. Get an API key from the [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add the key to your environment variables or directly in settings
3. Set Gemini as your default translation engine or configure it for specific languages

## Best Practices

- Gemini performs well with context information, so use context CSV files for JSON translations
- For better translations of technical content, consider using lower temperature settings
- Increase `maxOutputTokens` for longer text segments

## Supported Languages

Gemini supports a wide range of languages. The extension maps standard language codes automatically.
