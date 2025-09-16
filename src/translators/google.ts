import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'

const langMap: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-TW',
  'zh-Hant': 'zh-TW',
  'fr-CA': 'fr-ca',
  'fr-FR': 'fr-FR',
  'ms-Arab': 'ms-Arab',
  'mni-Mtei': 'mni-Mtei',
  'pt-PT': 'pt-PT',
  pt: 'pt-BR',
  'pt-BR': 'pt-BR',
  'pa-Arab': 'pa-Arab'
}

function norm(lang: string): string {
  return langMap[lang] ?? lang.split('-')[0].toLowerCase()
}

// function norm(locale: string): string {
//   // Google v2 accepts BCP-47; preserve region if present but lowercase language
//   const [lang, rest] = locale.split('-');
//   return rest ? `${lang.toLowerCase()}-${rest}` : lang.toLowerCase();
// }

export const GoogleTranslator: Translator = {
  name: 'google',
  normalizeLocale(locale: string) {
    return norm(locale)
  },

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const key = opts.apiConfig.key as string
    const endpoint =
      (opts.apiConfig.endpoint as string | undefined)?.replace(/\/+$/, '') || 'https://translation.googleapis.com'
    const timeout = Number(opts.apiConfig.timeoutMs ?? 30000)
    const model = opts.apiConfig.googleModel as string | undefined // optional
    const retry = opts.apiConfig.retry

    if (!key) throw new Error(`Google Translate: missing 'key'`)

    const url = `${endpoint}/language/translate/v2?key=${encodeURIComponent(key)}`
    const body: any = {
      q: texts,
      target: norm(opts.targetLocale),
      source: norm(opts.sourceLocale),
      format: 'text'
    }
    if (model) body.model = model

    const json = await withRetry(retry, () => postJson<any>(url, body, {}, timeout))

    const list = json?.data?.translations ?? []
    // Google may return HTML-escaped content; allow as-is, caller can decode if necessary
    return list.map((t: any, idx: number) => t?.translatedText ?? texts[idx])
  }
}
