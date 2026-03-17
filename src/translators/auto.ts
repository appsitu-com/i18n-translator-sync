import type { ResolvedTranslatorEngine } from './types'

const EUROPEAN_TARGET_LANGUAGES = new Set(['de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'ru'])
const ASIAN_TARGET_LANGUAGES = new Set(['zh', 'ja', 'ko', 'th', 'vi'])
const GOOGLE_PRIORITY_TARGET_LANGUAGES = new Set(['ar', 'hi'])

function toLanguageCode(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]
}

export function selectEngine(
  _sourceLocale: string,
  targetLocale: string,
  fileType: 'md' | 'json'
): ResolvedTranslatorEngine {
  const normalizedTargetLocale = toLanguageCode(targetLocale)

  if (EUROPEAN_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'deepl'
  }

  if (ASIAN_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'google'
  }

  if (GOOGLE_PRIORITY_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'google'
  }

  // For locales outside explicit language groups, use document type defaults.
  return fileType === 'md' ? 'azure' : 'google'
}