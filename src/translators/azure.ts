import type { Translator, BulkTranslateOpts } from './types'
import type { IAzureConfig } from '../core/config'
import { postJson } from '../util/http'
import { randomUUID } from 'crypto'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const AzureTranslator: Translator = {
  name: 'azure',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const cfg = opts.apiConfig as IAzureConfig
    const endpoint = (cfg.endpoint ?? 'https://api.cognitive.microsofttranslator.com').replace(/\/+$/, '')
    const apiKey = cfg.apiKey
    const region = cfg.region

    const category = cfg.azureModel ? `custom:${cfg.azureModel}` : undefined
    const timeout = Number(cfg.timeoutMs ?? 30_000)
    const retry = cfg.retry
    const langMap = cfg.langMap ?? {}

    if (!apiKey) {
      throw new Error(`Azure Translator: missing 'apiKey'`)
    }
    if (!region) {
      throw new Error(`Azure Translator: missing 'region'`)
    }

    const masked = apiKey.length > 8
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : apiKey
    console.error(`Azure Translator: Using credentials - Region: ${region}, Key: ${masked}`)

    const headers = {
      'Ocp-Apim-Subscription-Key': apiKey,
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
