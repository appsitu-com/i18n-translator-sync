import type { ResolvedTranslatorEngine } from './types'
import { NLLB_SUPPORTED_LANGUAGE_LOCALE_CODES, NLLB_SUPPORTED_SCRIPT_LOCALE_CODES } from './nllbLanguageMap'

const EUROPEAN_TARGET_LANGUAGES = new Set(['de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'ru'])
const ASIAN_TARGET_LANGUAGES = new Set(['zh', 'ja', 'ko', 'th', 'vi'])
const GOOGLE_PRIORITY_TARGET_LANGUAGES = new Set(['ar', 'hi'])
const AZURE_SUPPORTED_TARGET_LANGUAGES = new Set([
  'af', 'am', 'ar', 'as', 'az', 'ba', 'be', 'bg', 'bho', 'bn', 'bo', 'brx', 'bs', 'ca', 'cs', 'cy', 'da', 'de',
  'doi', 'dsb', 'dv', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fil', 'fj', 'fo', 'fr', 'ga', 'gl', 'gom', 'gu',
  'ha', 'he', 'hi', 'hne', 'hr', 'hsb', 'ht', 'hu', 'hy', 'id', 'ig', 'ikt', 'is', 'it', 'iu', 'ja', 'ka', 'kk',
  'km', 'kmr', 'kn', 'ko', 'ks', 'ku', 'ky', 'lb', 'ln', 'lo', 'lt', 'lug', 'lv', 'lzh', 'mai', 'mg', 'mi', 'mk',
  'ml', 'mn', 'mni', 'mr', 'ms', 'mt', 'mww', 'my', 'nb', 'ne', 'nl', 'nso', 'nya', 'or', 'otq', 'pa', 'pl',
  'prs', 'ps', 'pt', 'ro', 'ru', 'run', 'rw', 'sd', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'st', 'sv',
  'sw', 'ta', 'te', 'th', 'ti', 'tk', 'tlh', 'tn', 'to', 'tr', 'tt', 'ty', 'ug', 'uk', 'ur', 'uz', 'vi', 'xh',
  'yo', 'yua', 'yue', 'zh', 'zu'
])
const GOOGLE_SUPPORTED_TARGET_LANGUAGES = new Set([
  'ab', 'ace', 'ach', 'af', 'ak', 'alz', 'am', 'ar', 'as', 'awa', 'ay', 'az', 'ba', 'ban', 'bbc', 'be', 'bem',
  'bew', 'bg', 'bho', 'bik', 'bm', 'bn', 'br', 'bs', 'bts', 'btx', 'bua', 'ca', 'ceb', 'cgg', 'chm', 'ckb',
  'cnh', 'co', 'crh', 'crs', 'cs', 'cv', 'cy', 'da', 'de', 'din', 'doi', 'dov', 'dv', 'dz', 'ee', 'el', 'en',
  'eo', 'es', 'et', 'eu', 'fa', 'ff', 'fi', 'fil', 'fj', 'fr', 'fy', 'ga', 'gaa', 'gd', 'gl', 'gn', 'gom',
  'gu', 'ha', 'haw', 'he', 'hi', 'hil', 'hmn', 'hr', 'hrx', 'ht', 'hu', 'hy', 'id', 'ig', 'ilo', 'is', 'it',
  'iw', 'ja', 'jv', 'jw', 'ka', 'kk', 'km', 'kn', 'ko', 'kri', 'ktu', 'ku', 'ky', 'la', 'lb', 'lg', 'li', 'lij',
  'lmo', 'ln', 'lo', 'lt', 'ltg', 'luo', 'lus', 'lv', 'mai', 'mak', 'mg', 'mi', 'min', 'mk', 'ml', 'mn', 'mni',
  'mr', 'ms', 'mt', 'my', 'ne', 'new', 'nl', 'no', 'nr', 'nso', 'nus', 'ny', 'oc', 'om', 'or', 'pa', 'pag',
  'pam', 'pap', 'pl', 'ps', 'pt', 'qu', 'rn', 'ro', 'rom', 'ru', 'rw', 'sa', 'scn', 'sd', 'sg', 'shn', 'si',
  'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw', 'szl', 'ta', 'te', 'tet', 'tg', 'th',
  'ti', 'tk', 'tl', 'tn', 'tr', 'ts', 'tt', 'ug', 'uk', 'ur', 'uz', 'vi', 'xh', 'yi', 'yo', 'yua', 'yue', 'zh',
  'zu'
])

function toLanguageCode(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]
}

function isNllbSupportedTarget(locale: string): boolean {
  const normalizedLocale = locale.toLowerCase().replace(/-/g, '_')
  if (NLLB_SUPPORTED_SCRIPT_LOCALE_CODES.has(normalizedLocale)) {
    return true
  }

  const baseCode = toLanguageCode(locale)
  return NLLB_SUPPORTED_LANGUAGE_LOCALE_CODES.has(baseCode)
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

  const preferredEngine: ResolvedTranslatorEngine = fileType === 'md' ? 'azure' : 'google'
  const fallbackEngine: ResolvedTranslatorEngine = fileType === 'md' ? 'google' : 'azure'

  const preferredSupportsTarget =
    preferredEngine === 'azure'
      ? AZURE_SUPPORTED_TARGET_LANGUAGES.has(normalizedTargetLocale)
      : GOOGLE_SUPPORTED_TARGET_LANGUAGES.has(normalizedTargetLocale)

  if (preferredSupportsTarget) {
    return preferredEngine
  }

  const fallbackSupportsTarget =
    fallbackEngine === 'azure'
      ? AZURE_SUPPORTED_TARGET_LANGUAGES.has(normalizedTargetLocale)
      : GOOGLE_SUPPORTED_TARGET_LANGUAGES.has(normalizedTargetLocale)

  if (fallbackSupportsTarget) {
    return fallbackEngine
  }

  if (isNllbSupportedTarget(targetLocale)) {
    return 'nllb'
  }

  throw new Error(
    `Auto engine routing could not find support for target locale '${targetLocale}' in azure, google, or nllb`
  )
}