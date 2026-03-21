/**
 * Shared utility for locale normalization across translation services
 */

/**
 * Standard locale normalization function used by multiple translators
 * @param locale The locale string to normalize
 * @param langMap Service-specific language code mappings
 * @returns Normalized locale string
 */
export function normalizeLocaleWithMap(locale: string, langMap: Record<string, string>): string {
  return langMap[locale] ?? locale
}


export function toLanguage(locale: string): string {
  return locale.split(/[-_]/)[0]
}