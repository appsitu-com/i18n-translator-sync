import type { Translator, TranslatorEngine } from './types'

const REGISTRY = new Map<string, Translator>()

export function registerTranslator(t: Translator) {
  REGISTRY.set(t.name, t)
}

export function getTranslator(name: string): Translator {
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
