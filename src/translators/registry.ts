import type { Translator, TranslatorEngine } from './types'

const DEFAULT_TRANSLATION_LIMIT = Number.MAX_SAFE_INTEGER

export interface TranslatorRegistration {
  limit?: number
}

export interface RegisteredTranslator {
  translator: Translator
  limit: number
}

const REGISTRY = new Map<string, RegisteredTranslator>()

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number') {
    return DEFAULT_TRANSLATION_LIMIT
  }

  if (!Number.isFinite(limit) || limit < 1) {
    return DEFAULT_TRANSLATION_LIMIT
  }

  return Math.floor(limit)
}

export function registerTranslator(t: Translator, registration: TranslatorRegistration = {}) {
  REGISTRY.set(t.name, {
    translator: t,
    limit: normalizeLimit(registration.limit)
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
  return (params.overrides[key] ?? defaultEngine) as TranslatorEngine
}
