# Code Architecture

## Extractors

The extension supports extracting translatable strings from different file formats:

### Structured Data Extractor

The `structured.ts` module provides a shared implementation for extracting strings from structured data formats like JSON and YAML. Both formats are represented as JavaScript objects after parsing, and they share the same traversal and rebuilding logic.

Key components:
- `extractStructuredData()`: Main function that extracts translatable strings from a parsed object
- `pathToString()`: Converts a path array to a string representation for context lookups
- `ExtractorKind`: Type that defines possible extractor kinds ('json', 'yaml', 'markdown')

### Format-Specific Extractors

- `json.ts`: JSON file extraction using the shared structured data extractor
- `yaml.ts`: YAML file extraction using the shared structured data extractor
- `markdown.ts`: Markdown file extraction using a different approach with remark

## Translation Pipeline

The translation pipeline (`pipeline.ts`) processes files through these steps:
1. Detect file type based on extension
2. Extract translatable strings using the appropriate extractor
3. Determine which translation engine to use based on configuration
4. Translate strings using the selected engine
5. Rebuild the file with translated strings
6. Write the output to the target locale directory

## File Type Support

Currently supported file types:
- JSON (`.json`)
- YAML (`.yaml`, `.yml`)
- Markdown (`.md`, `.mdx`)

## Translation Engines

The extension supports multiple translation engines:
- Azure Translator
- Google Translate
- DeepL
- Gemini
- Copy (no translation, just copies the original text)

Each engine can be configured per file type and per locale in the `.translate.json` configuration file.
