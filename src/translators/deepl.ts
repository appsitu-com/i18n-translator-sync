import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'

const langMap: Record<string, string> = {
  // English
  en: 'EN', // generic EN
  'en-US': 'EN-US',
  'en-GB': 'EN-GB',

  // Portuguese
  pt: 'PT-PT', // fallback if no region
  'pt-PT': 'PT-PT',
  'pt-BR': 'PT-BR',

  // Chinese simplified
  zh: 'ZH-HANS', // fallback if no region
  'zh-Hans': 'ZH-HANS',
  'zh-CN': 'ZH-HANS',
  'zh-SG': 'ZH-HANS',

  // Chinese traditional
  'zh-Hant': 'ZH-HANT',
  'zh-TW': 'ZH-HANT',
  'zh-HK': 'ZH-HANT',
  'zh-MO': 'ZH-HANT'
}

function normalizeForDeepL(locale: string): string {
  // DeepL expects target like EN-GB/EN-US; other languages uppercase 2-letter, allow ZH, etc.
  const [lang, region] = locale.split('-')
  const l = lang.toLowerCase()
  if (!region) {
    // e.g., fr -> FR
    if (l === 'en') return 'EN' // DeepL requires EN, and may specialize via EN-GB/EN-US
    return l.toUpperCase()
  }
  if (l === 'en') return region.toUpperCase() === 'US' ? 'EN-US' : 'EN-GB'
  if (l === 'pt') return region.toUpperCase() === 'BR' ? 'PT-BR' : 'PT-PT'
  if (l === 'zh') {
    const r = region.toUpperCase()
    if (r in { HANS: 1, HANT: 1 }) return `ZH-${r}`
    if (r in { CN: 1, SG: 1 }) return 'ZH-HANS'
    if (r in { TW: 1, HK: 1, MO: 1 }) return 'ZH-HANT'
  }
  return l.toUpperCase()
}

export const DeepLTranslator: Translator = {
  name: 'deepl',
  normalizeLocale(locale: string) {
    return normalizeForDeepL(locale)
  },

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const authKey = opts.apiConfig.key as string
    const free = !!opts.apiConfig.free
    const base =
      (opts.apiConfig.endpoint as string | undefined)?.replace(/\/+$/, '') ||
      (free ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
    const timeout = Number(opts.apiConfig.timeoutMs ?? 30000)
    const formality = opts.apiConfig.formality as string | undefined
    const model_type = opts.apiConfig.deeplModel as string | undefined

    if (!authKey) throw new Error(`DeepL: missing 'key'`)
    const headers = { Authorization: `DeepL-Auth-Key ${authKey}` }

    const target = normalizeForDeepL(opts.targetLocale)
    const source = normalizeForDeepL(opts.sourceLocale)

    // Group texts by context, because DeepL's 'context' parameter applies to the whole request.
    const groups = new Map<string, number[]>()
    for (let i = 0; i < texts.length; i++) {
      const c = (contexts[i] ?? '').toString()
      const key = c // group key
      const arr = groups.get(key) ?? []
      arr.push(i)
      groups.set(key, arr)
    }

    const out: string[] = new Array(texts.length)
    for (const [ctx, idxs] of groups.entries()) {
      const chunk = idxs.map((i) => texts[i])
      const url = `${base}/v2/translate`
      const body: any = {
        text: chunk,
        target_lang: target,
        source_lang: source
      }
      if (ctx) body.context = ctx
      if (formality) body.formality = formality
      if (model_type) body.model_type = model_type

      const json = await postJson<any>(url, body, headers, timeout)

      const trans = json?.translations ?? []
      for (let k = 0; k < idxs.length; k++) {
        out[idxs[k]] = trans[k]?.text ?? chunk[k]
      }
    }
    return out
  }
}
