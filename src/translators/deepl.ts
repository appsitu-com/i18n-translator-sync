import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { normalizeLocaleWithMap, toLanguage } from '../util/localeNorm'

/** Default endpoints for DeepL */
export const DEEPL_DEFAULT_ENDPOINT_FREE = 'https://api-free.deepl.com'
export const DEEPL_DEFAULT_ENDPOINT = 'https://api.deepl.com'

/** Allowed domains for DeepL endpoint validation */
export const DEEPL_ALLOWED_DOMAINS = [
  'api-free.deepl.com',
  'api.deepl.com',
  '*.deepl.com'
] as const

/** DeepL Translation config schema */
export const DeepLConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(DEEPL_DEFAULT_ENDPOINT),
  freeEndpoint: z.string().default(DEEPL_DEFAULT_ENDPOINT_FREE),
  free: z.boolean().default(false),
  formality: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number().int().min(0).default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred DeepL config type */
export type IDeepLConfig = z.infer<typeof DeepLConfigSchema>

export const DeepLTranslator: Translator<IDeepLConfig> = {
  name: 'deepl',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<IDeepLConfig>) {
    const cfg = opts.apiConfig
    const authKey = cfg.apiKey
    const free = cfg.free
    const endpoint = (free ? cfg.freeEndpoint : cfg.endpoint).replace(/\/+$/, '')
    const timeout = cfg.timeoutMs
    const formality = cfg.formality
    const model_type = cfg.model
    const langMap = cfg.langMap

    if (!authKey) throw new Error(`DeepL: missing 'apiKey'`)
    const headers = { Authorization: `DeepL-Auth-Key ${authKey}` }

    // DeepL documents uppercase locale codes

    // DeeL wants just the root language from a source_lang only but not for target_lang that can include region/script
    // https://developers.deepl.com/docs/getting-started/supported-languages
    const source_lang = toLanguage(normalizeLocaleWithMap(opts.sourceLocale, langMap)).toUpperCase()
    const target_lang = normalizeLocaleWithMap(opts.targetLocale, langMap).toUpperCase()

    // Group texts by context, because DeepL's 'context' parameter applies to the whole request.
    const groups = new Map<string, number[]>()
    for (let i = 0; i < texts.length; i++) {
      const c = (_contexts[i] ?? '').toString()
      const key = c // group key
      const arr = groups.get(key) ?? []
      arr.push(i)
      groups.set(key, arr)
    }

    const out: string[] = new Array(texts.length)
    for (const [ctx, idxs] of groups.entries()) {
      const chunk = idxs.map((i) => texts[i])
      const url = `${endpoint}/v2/translate`
      const body: any = { text: chunk, source_lang, target_lang }

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
