import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'
import { randomUUID } from 'crypto'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const AzureTranslator: Translator = {
  name: 'azure',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const endpoint =
      ((opts.apiConfig.endpoint as string | undefined) ||
        ((opts.apiConfig as { url?: string }).url as string | undefined) ||
        process.env.AZURE_TRANSLATION_URL)?.replace(/\/+$/, '') ||
      'https://api.cognitive.microsofttranslator.com'
    const key = opts.apiConfig.key as string | undefined
    const apiKey = (opts.apiConfig as { apiKey?: string }).apiKey as string | undefined
    const region = (opts.apiConfig.region as string | undefined) || process.env.AZURE_TRANSLATION_REGION

    // Log what we received (masked)
    const keyToUse = key || apiKey || process.env.AZURE_TRANSLATION_KEY
    const masked = keyToUse && keyToUse.length > 8 ? `${keyToUse.substring(0, 4)}...${keyToUse.substring(keyToUse.length - 4)}` : keyToUse || '[not provided]'
    console.error(`[AZURE] Received config - key field: ${key ? 'present' : 'missing'}, apiKey field: ${apiKey ? 'present' : 'missing'}, actual value: ${masked}`)
    console.error(`[AZURE] Config region: ${region}`)

    // can use a customised translation model
    const category = opts.apiConfig.azureModel ? `custom:${opts.apiConfig.azureModel}` : undefined
    // const textType = (opts.apiConfig.textType as string | undefined) ?? 'plain'
    const timeout = Number(opts.apiConfig.timeoutMs ?? 30000)
    const retry = opts.apiConfig.retry

    // Use langMap from config, fallback to no mapping if not provided
    const langMap = opts.apiConfig.langMap || {}

    if (!keyToUse) {
      console.error(`Azure Translator: missing 'key' (checked both 'key' and 'apiKey' fields)`)
      throw new Error(`Azure Translator: missing 'key' (checked both 'key' and 'apiKey' fields)`)
    }
    if (!region) {
      console.error(`Azure Translator: missing 'region'`)
      throw new Error(`Azure Translator: missing 'region'`)
    }

    console.error(`Azure Translator: Using credentials - Region: ${region}, Key: ${masked}`)

    const headers = {
      'Ocp-Apim-Subscription-Key': keyToUse,
      'Ocp-Apim-Subscription-Region': region,
      'Content-type': 'application/json',
      'X-ClientTraceId': randomUUID()
    }

    const from = normalizeLocaleWithMap(opts.sourceLocale, langMap)
    const to = normalizeLocaleWithMap(opts.targetLocale, langMap)

    const url = new URL(`${endpoint}/translate`)
    url.searchParams.set('api-version', '3.0')
    url.searchParams.set('from', from)
    url.searchParams.append('to', to)
    if (category) url.searchParams.set('category', category)

    const body = texts.map((s) => ({ Text: s }))
    const json = await withRetry(retry, () => postJson<any[]>(url.toString(), body, headers, timeout))

    const out = texts.map((text, index) => json[index]?.translations?.[0]?.text ?? text)
    return out
  }
}
