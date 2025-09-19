# Engine Overrides Update

The `engineOverrides` configuration has been updated to use string arrays instead of comma-separated strings. This change improves type safety and makes the configuration more consistent with other array-based settings.

## Changes

1. Updated the type definition in `config.ts`:
   - Changed from `Record<string, string>` to `Record<string, string[]>`

2. Updated configuration handling:
   - Added automatic conversion from legacy string format to array format
   - Updated documentation to reflect the new format

3. Updated pipeline processing:
   - Modified the code that processes engine overrides to work with arrays

## Migration

If you're using the `.translator.json` file, update your engine overrides from:

```json
"engineOverrides": {
  "deepl": "fr,de",
  "azure": "es:en,ja:en"
}
```

To:

```json
"engineOverrides": {
  "deepl": ["fr", "de"],
  "azure": ["es:en", "ja:en"]
}
```

For VSCode settings, the old format will be automatically converted, so no changes are needed.

## Benefits

- More consistent with other array-based configuration
- Better type safety
- Clearer configuration structure
- Easier to programmatically manipulate engine overrides
