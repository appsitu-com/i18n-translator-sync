import type { Translator, BulkTranslateOpts, TranslatorApiConfig, MyMemoryConfig } from './types'
import { withRetry } from '../util/retry'

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal as any })
  } finally {
    clearTimeout(t)
  }
}

// FIXME: Fix LOCALE_MAP values for MyMemory.translated.net
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

export class MyMemoryTranslator implements Translator {
  name = 'mymemory'

  // Default normalizer: lowercase language, keep region if any
  defaultNorm(locale: string): string {
    const [lang, region] = locale.split('-')
    return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase()
  }

  normalizeLocale(locale: string): string {
    return LOCALE_MAP[locale] ?? this.defaultNorm(locale)
  }

  async translateMany(texts: string[], _contexts: string[], opts: BulkTranslateOpts) {
    const cfg = opts.apiConfig as MyMemoryConfig
    const endpoint = (cfg.endpoint ?? 'https://api.mymemory.translated.net/get').replace(/\/+$/, '')
    const email = cfg.email
    const key = cfg.key

    const throttleMs = cfg.throttleMs ?? 100
    const timeoutMs = cfg.timeoutMs ?? 15000
    const maxRetries = cfg.maxRetries ?? 2

    const from = this.normalizeLocale(opts.sourceLocale)
    const to = this.normalizeLocale(opts.targetLocale)

    const out: string[] = new Array(texts.length)

    for (let i = 0; i < texts.length; i++) {
      const q = texts[i] ?? ''

      if (i > 0 && throttleMs > 0) {
        await new Promise((r) => setTimeout(r, throttleMs))
      }

      out[i] = await withRetry(
        { maxRetries, delayMs: throttleMs, backoffFactor: 2 },
        async () => {
          const url = new URL(endpoint)
          url.searchParams.set('q', q)
          url.searchParams.set('langpair', `${from}|${to}`)
          if (email) url.searchParams.set('de', email)
          if (key) url.searchParams.set('key', key)

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
