# Project Configuration

## translator.json

The extension now supports a project-specific configuration file called `translator.json` in the root of your workspace. This allows you to configure the translator without modifying VSCode settings.

### Example Configuration

```json
{
  "sourcePaths": ["i18n/en", "i18n/en.json"],
  "sourceLocale": "en",
  "targetLocales": ["es", "fr", "de", "ja", "zh-CN"],
  "enableBackTranslation": true,
  "defaultMarkdownEngine": "azure",
  "defaultJsonEngine": "google",
  "engineOverrides": {
    "deepl": ["fr", "de"],
    "azure": ["es:en", "ja:en"],
    "gemini": ["zh-CN"]
  },
  "excludeKeys": ["_comment", "$schema"],
  "excludeKeyPaths": ["meta.version", "build.timestamp"],
  "copyOnlyFiles": ["index.ts"],
  "csvExportPath": "translator.csv",
  "autoExport": true,
  "autoImport": true
}
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `sourcePaths` | `string[]` | Source language directories to scan for files to translate OR single source files | `["i18n/en", "i18n/en.json"]` |
| `sourceLocale` | `string` | Source locale | `"en"` |
| `targetLocales` | `string[]` | Target locales to generate translations for | `['fr-FR', 'fr-CA']` |
| `enableBackTranslation` | `boolean` | Enable back translation | `false` |
| `defaultMarkdownEngine` | `string` | Default engine for markdown & MDX files (azure, google, deepl, gemini, copy, auto) | `"azure"` |
| `defaultJsonEngine` | `string` | Default engine for JSON, YAML, and YML files (azure, google, deepl, gemini, copy, auto) | `"google"` |
| `engineOverrides` | `Record<string, string[]>` | Engine overrides keyed by engine code (`azure`, `google`, `deepl`, `gemini`, `copy`, `auto`) | `{"auto": ["en:ja"], "deepl": ["fr", "de"]}` |
| `excludeKeys` | `string[]` | Key names to exclude from translation (copied unchanged). Matches at any nesting depth. | `[]` |
| `excludeKeyPaths` | `string[]` | Exact dotted key paths to exclude from translation (e.g. `"meta.version"`). | `[]` |
| `copyOnlyFiles` | `string[]` | File names (not paths) to copy verbatim instead of translating (e.g. `"index.ts"`). | `[]` |
| `csvExportPath` | `string` | Path to cache CSV used for export and manual import. Relative paths are resolved from workspace root. | `"translator.csv"` |
| `autoExport` | `boolean` | Automatically export cache to CSV after translation operations complete. | `true` |
| `autoImport` | `boolean` | On startup, when the database is newly created, auto-import translations from CSV. Prefers `translations.csv`, then falls back to `csvExportPath` if present. | `false` |

## Backward Compatibility

For backward compatibility, the extension will still read from VSCode settings if no `translator.json` file is found or if certain options are not specified in the file.

## Path Resolution (VSCode + CLI)

Path resolution is intentionally consistent across VSCode and CLI.

- A single runtime root directory is decided first:
  - VSCode: the first workspace folder.
  - CLI: the `workspace` argument (or current directory when omitted).
- Relative paths in config are resolved from that root directory.
- `translator.env` is loaded from that root directory.
- In CLI mode, `--config <path>` selects which translator JSON file is parsed, while relative path values inside that config are still resolved from the CLI workspace root.

Examples of values resolved from root directory:

- `csvExportPath`
- relative credential paths such as `GOOGLE_TRANSLATION_KEY='.translator/gkey.json'`
- other engine-specific relative file paths

## Engine Overrides

The `engineOverrides` configuration allows you to specify which translation engine to use for specific language pairs. The key is the engine name, and the value is an array of locale patterns.

Example:
```json
"engineOverrides": {
  "auto": ["en:ja", "en:ko"],
  "deepl": ["fr", "de"],        // Use DeepL for French and German
  "azure": ["es:en", "ja:en"],   // Use Azure for Spanish->English and Japanese->English
  "gemini": ["zh-CN"]          // Use Gemini for Chinese
}
```

Each locale pattern can be either:
- A single locale code (e.g., "fr") - this will be used for both translations to and from the source locale
- A locale pair (e.g., "es:en") - this specifies a specific translation direction (Spanish to English)

You can also use `"auto"` as an override key to route only selected locale pairs through automatic engine selection.

## Auto Engine Selection

Set `defaultMarkdownEngine`, `defaultJsonEngine`, or an `engineOverrides` value to `"auto"` to let the pipeline choose the engine from locale pairs.

Selection precedence:
- `engineOverrides` exact pair match (for example, `"en:ja"`) is applied first.
- If the selected engine is `"auto"`, routing uses normalized language codes.
- If no override matches, the file-type default (`defaultMarkdownEngine` or `defaultJsonEngine`) is used, and if that default is `"auto"`, the same routing rules apply.

Selection rules (using normalized language codes from locales like `fr-FR` -> `fr`):
- `deepl` for target languages: `de`, `fr`, `es`, `it`, `nl`, `pl`, `pt`, `ru`
- `google` for target languages: `zh`, `ja`, `ko`, `th`, `vi`, `ar`, `hi`
- for all other target languages: `azure` for markdown/MDX, `google` for JSON/YAML/TypeScript

## TypeScript File Support

The extension supports TypeScript i18n files that use the `export default { ... }` pattern:

```ts
export default {
  greeting: "Hello",
  farewell: "Goodbye"
};
```

TypeScript files are extracted by stripping the `export default` wrapper, processing the inner object as JSON, and restoring the wrapper on rebuild. The `as const` suffix is also preserved if present.

TypeScript files use the `defaultJsonEngine` setting for translation engine selection.

## Excluding Keys from Translation

You can exclude specific keys from translation so their values are copied unchanged. This is useful for metadata, version strings, or keys that should not be translated.

- **`excludeKeys`**: Key names to exclude at any nesting depth. For example, `["_comment"]` excludes every key named `_comment` regardless of where it appears.
- **`excludeKeyPaths`**: Exact dotted key paths to exclude. For example, `["meta.version"]` excludes only the `version` key inside `meta`, not a `version` key elsewhere.

These settings apply to JSON, YAML, and TypeScript files. They are configured in `translator.json` only.

```json
{
  "excludeKeys": ["_comment", "$schema"],
  "excludeKeyPaths": ["meta.version", "build.timestamp"]
}
```

## Copy-Only Files

You can configure specific file names to be copied verbatim to all target locale directories without translation. This is useful for barrel files (`index.ts`), configuration files, or any file that should be identical across locales.

Specify file names (not paths) in `copyOnlyFiles`:

```json
{
  "copyOnlyFiles": ["index.ts", "constants.json"]
}
```

When a file matches a name in `copyOnlyFiles`, it is copied to all target locale directories (and back-translation directories if enabled) without any translation processing.
