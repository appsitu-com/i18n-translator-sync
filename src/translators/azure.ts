import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { randomUUID } from 'crypto'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

/** Default endpoint for Azure Translator */
export const AZURE_DEFAULT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com'

/** Allowed domains for Azure Translator endpoint validation */
export const AZURE_ALLOWED_DOMAINS = [
  'api.cognitive.microsofttranslator.com',
  '*.cognitive.microsofttranslator.com'
] as const

/** Microsoft Azure Translator config schema */
export const AzureConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(AZURE_DEFAULT_ENDPOINT),
  region: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  batchSize: z.number().int().min(1).optional(),
  timeoutMs: z.number().int().min(0).default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred Azure config type */
export type IAzureConfig = z.infer<typeof AzureConfigSchema>

export const AzureTranslator: Translator<IAzureConfig> = {
  name: 'azure',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<IAzureConfig>) {
    const cfg = opts.apiConfig
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const apiKey = cfg.apiKey
    const region = cfg.region

    const category = cfg.model ? `custom:${cfg.model}` : undefined
    const timeout = cfg.timeoutMs
    const retry = cfg.retry
    const langMap = cfg.langMap

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
