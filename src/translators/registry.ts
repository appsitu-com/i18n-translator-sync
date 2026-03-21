import type { ResolvedTranslatorEngine, Translator, TranslatorEngine } from './types'
import { selectEngine } from './auto'

const DEFAULT_TRANSLATION_LIMIT = Number.MAX_SAFE_INTEGER
const DEFAULT_TRANSLATION_MAX_CHARS = Number.MAX_SAFE_INTEGER
const DEFAULT_TRANSLATION_MAX_ITEM_CHARS = Number.MAX_SAFE_INTEGER

export interface TranslatorRegistration {
  limit?: number
  maxchars?: number
  maxitemchars?: number
}

export interface RegisteredTranslator {
  translator: Translator
  limit: number
  maxchars: number
  maxitemchars: number
}

const REGISTRY = new Map<string, RegisteredTranslator>()

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
  const maxchars = normalizePositiveInteger(registration.maxchars, DEFAULT_TRANSLATION_MAX_CHARS)
  const maxitemchars = Math.min(
    normalizePositiveInteger(registration.maxitemchars, DEFAULT_TRANSLATION_MAX_ITEM_CHARS),
    maxchars
  )

  REGISTRY.set(t.name, {
    translator: t,
    limit: normalizePositiveInteger(registration.limit, DEFAULT_TRANSLATION_LIMIT),
    maxchars,
    maxitemchars
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
}): ResolvedTranslatorEngine {
  const key = `${params.source}:${params.target}`
  const autoRouteFileType: 'md' | 'json' = params.fileType === 'md' ? 'md' : 'json'
  const defaultEngine = params.defaults[params.fileType as keyof typeof params.defaults] || params.defaults.json
  const selectedEngine = (params.overrides[key] ?? defaultEngine) as TranslatorEngine

  if (selectedEngine === 'auto') {
    return selectEngine(params.source, params.target, autoRouteFileType)
  }

  return selectedEngine
}
