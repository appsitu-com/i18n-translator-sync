import type { Translator, TranslatorEngine } from './types'

const DEFAULT_TRANSLATION_LIMIT = Number.MAX_SAFE_INTEGER
const DEFAULT_TRANSLATION_MAX_CHARS = Number.MAX_SAFE_INTEGER

export interface TranslatorRegistration {
  limit?: number
  maxchars?: number
}

export interface RegisteredTranslator {
  translator: Translator
  limit: number
  maxchars: number
}

const REGISTRY = new Map<string, RegisteredTranslator>()

const EUROPEAN_TARGET_LANGUAGES = new Set(['de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'ru'])
const ASIAN_TARGET_LANGUAGES = new Set(['zh', 'ja', 'ko', 'th', 'vi'])
const GOOGLE_PRIORITY_TARGET_LANGUAGES = new Set(['ar', 'hi'])

function toLanguageCode(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]
}

function selectEngine(sourceLocale: string, targetLocale: string): TranslatorEngine {
  const normalizedSourceLocale = toLanguageCode(sourceLocale)
  const normalizedTargetLocale = toLanguageCode(targetLocale)

  // Keep source locale available for pair-based routing expansion.
  void normalizedSourceLocale

  if (EUROPEAN_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'deepl'
  }

  if (ASIAN_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'google'
  }

  if (GOOGLE_PRIORITY_TARGET_LANGUAGES.has(normalizedTargetLocale)) {
    return 'google'
  }

  return 'google'
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number') {
    return fallback
  }

  if (!Number.isFinite(value) || value < 1) {
    return fallback
  }

  return Math.floor(value)
}

export function registerTranslator(t: Translator, registration: TranslatorRegistration = {}) {
  REGISTRY.set(t.name, {
    translator: t,
    limit: normalizePositiveInteger(registration.limit, DEFAULT_TRANSLATION_LIMIT),
    maxchars: normalizePositiveInteger(registration.maxchars, DEFAULT_TRANSLATION_MAX_CHARS)
  })
}

export function getTranslator(name: string): Translator {
  return getRegisteredTranslator(name).translator
}

export function getRegisteredTranslator(name: string): RegisteredTranslator {
  const t = REGISTRY.get(name)
  if (!t) throw new Error(`Translator not registered: ${name}`)
  return t
}

export function deregisterTranslator(name: string) {
  REGISTRY.delete(name)
}

export function pickEngine(params: {
  source: string
  target: string
  defaults: { md: string; json: string }
  overrides: Record<string, string>
  fileType: string
}): TranslatorEngine {
  const key = `${params.source}:${params.target}`
  const defaultEngine = params.defaults[params.fileType as keyof typeof params.defaults] || params.defaults.json
  const selectedEngine = (params.overrides[key] ?? defaultEngine) as TranslatorEngine

  if (selectedEngine === 'auto') {
    return selectEngine(params.source, params.target)
  }

  return selectedEngine
}
