/**
 * Utility functions for translation engine management
 */

/**
 * Create engine override mapping from configuration
 *
 * Transforms the engine overrides configuration into a lookup map for efficient engine selection.
 *
 * @param overrideCfg Configuration mapping engine names to locale patterns
 * @returns Lookup map from locale pairs to engine names
 *
 * @example
 * ```typescript
 * const config = {
 *   "deepl": ["fr", "de"],
 *   "azure": ["es:en", "ja:en"]
 * };
 *
 * const overrides = createEngineOverrides(config);
 * // Returns:
 * // {
 * //   "en:fr": "deepl",
 * //   "fr:en": "deepl",
 * //   "en:de": "deepl",
 * //   "de:en": "deepl",
 * //   "es:en": "azure",
 * //   "ja:en": "azure"
 * // }
 * ```
 */
export function createEngineOverrides(overrideCfg: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overrideCfg).flatMap(([engine, localePatterns]) =>
      localePatterns.flatMap((localePattern) => {
        const locale = localePattern.trim()
        return locale.match(/:/)
          ? [[locale, engine]] // locale is actually fromLocale:toLocale
          : [
              [`en:${locale}`, engine],
              [`${locale}:en`, engine]
            ]
      })
    )
  )
}