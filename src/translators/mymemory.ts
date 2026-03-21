import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { withRetry } from '../util/retry'

/** Default endpoint for MyMemory API */
export const MYMEMORY_DEFAULT_ENDPOINT = 'https://api.mymemory.translated.net/get'

/** Allowed domains for MyMemory endpoint validation */
export const MYMEMORY_ALLOWED_DOMAINS = [
  'api.mymemory.translated.net',
  '*.mymemory.translated.net'
] as const

/** MyMemory translation engine config schema */
export const MyMemoryConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(MYMEMORY_DEFAULT_ENDPOINT),
  email: z.string().optional(),
  timeoutMs: z.number().int().min(0).default(15_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred MyMemory config type */
export type IMyMemoryConfig = z.infer<typeof MyMemoryConfigSchema>

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal as any })
  } finally {
    clearTimeout(t)
  }
}

// FIXME: Fix LOCALE_MAP values for mymemory.translated.net
const LOCALE_MAP: Record<string, string> = {
  // Chinese
  zh: 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-SG': 'zh-CN',
  'zh-Hans': 'zh-CN',

  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-TW',
  'zh-MO': 'zh-TW',
  'zh-Hant': 'zh-TW',

  // Portuguese
  pt: 'pt-BR',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',

  // Serbian
  sr: 'sr',
  'sr-Latn': 'sr',
  'sr-Cyrl': 'sr',

  // Mongolian
  mn: 'mn',
  'mn-Cyrl': 'mn',
  'mn-Mong': 'mn',

  // Inuktitut
  iu: 'iu',
  'iu-Latn': 'iu'
}

export class MyMemoryTranslator implements Translator<IMyMemoryConfig> {
  name = 'mymemory'

  // Default normalizer: lowercase language, keep region if any
  defaultNorm(locale: string): string {
    const [lang, region] = locale.split('-')
    return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase()
  }

  normalizeLocale(locale: string): string {
    return LOCALE_MAP[locale] ?? this.defaultNorm(locale)
  }

  async translateMany(texts: string[], _contexts: string[], opts: BulkTranslateOpts<IMyMemoryConfig>) {
    const cfg = opts.apiConfig
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const email = cfg.email
    const apiKey = cfg.apiKey

    const timeoutMs = cfg.timeoutMs
    const maxRetries = cfg.retry?.maxRetries ?? 2
    const delayMs = cfg.retry?.delayMs ?? 100
    const backoffFactor = cfg.retry?.backoffFactor ?? 2
    const retry = { maxRetries, delayMs, backoffFactor }
    const langMap = cfg.langMap

    const from = langMap[opts.sourceLocale] ?? this.normalizeLocale(opts.sourceLocale)
    const to = langMap[opts.targetLocale] ?? this.normalizeLocale(opts.targetLocale)

    const out: string[] = new Array(texts.length)

    for (let i = 0; i < texts.length; i++) {
      const q = texts[i] ?? ''

      if (i > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }

      out[i] = await withRetry(
        retry,
        async () => {
          const url = new URL(endpoint)
          url.searchParams.set('q', q)
          url.searchParams.set('langpair', `${from}|${to}`)
          if (email) url.searchParams.set('de', email)
          if (apiKey) url.searchParams.set('key', apiKey)

          const res = await fetchWithTimeout(url.toString(), timeoutMs)
          const txt = await res.text()
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`)

          let json: any
          try {
            json = JSON.parse(txt)
          } catch {
            json = {}
          }

          const primary = json?.responseData?.translatedText
          if (primary) return primary
          if (Array.isArray(json?.matches)) {
            const match = json.matches.find((m: any) => m?.translation)
            if (match) return match.translation
          }
          return q
        }
      )
    }

    return out
  }
}
