import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'
import { randomUUID } from 'crypto'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const AzureTranslator: Translator = {
  name: 'azure',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const endpoint =
      (opts.apiConfig.endpoint as string | undefined)?.replace(/\/+$/, '') ||
      'https://api.cognitive.microsofttranslator.com'
    const key = opts.apiConfig.key as string
    const region = opts.apiConfig.region as string | undefined
    // can use a customised translation model
    const category = opts.apiConfig.azureModel ? `custom:${opts.apiConfig.azureModel}` : undefined
    // const textType = (opts.apiConfig.textType as string | undefined) ?? 'plain'
    const timeout = Number(opts.apiConfig.timeoutMs ?? 30000)
    const retry = opts.apiConfig.retry

    // Use langMap from config, fallback to no mapping if not provided
    const langMap = opts.apiConfig.langMap || {}

    if (!key) throw new Error(`Azure Translator: missing 'key'`)
    if (!region) throw new Error(`Azure Translator: missing 'region'`)

    const headers = {
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region,
      'Content-type': 'application/json',
      'X-ClientTraceId': randomUUID()
    }

    // Azure supports up to 100 items per request
    const batchSize = Math.min(100, Number(opts.apiConfig.batchSize ?? 100))
    const out: string[] = new Array(texts.length)
    const from = normalizeLocaleWithMap(opts.sourceLocale, langMap)
    const to = normalizeLocaleWithMap(opts.targetLocale, langMap)
    let i = 0

    while (i < texts.length) {
      const slice = texts.slice(i, i + batchSize)
      const url = new URL(`${endpoint}/translate`)
      url.searchParams.set('api-version', '3.0')
      url.searchParams.set('from', from)
      url.searchParams.append('to', to)
      if (category) url.searchParams.set('category', category)

      const body = slice.map((s) => ({ Text: s }))
      const json = await withRetry(retry, () => postJson<any[]>(url.toString(), body, headers, timeout))

      // Response is array of results, each with translations[0].text
      let k = 0
      for (const item of json) {
        const translated = item?.translations?.[0]?.text ?? slice[k]
        out[i + k] = translated
        k++
      }
      i += batchSize
    }
    return out
  }
}
