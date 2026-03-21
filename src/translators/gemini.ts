import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

/** Default endpoint for Gemini API */
export const GEMINI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

/** Default model for Gemini API */
export const GEMINI_DEFAULT_MODEL = 'gemini-pro'

/** Allowed domains for Gemini endpoint validation */
export const GEMINI_ALLOWED_DOMAINS = [
  'generativelanguage.googleapis.com',
  '*.googleapis.com'
] as const

/** Google Gemini (LLM-based translation) config schema */
export const GeminiConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(GEMINI_DEFAULT_ENDPOINT),
  model: z.string().default(GEMINI_DEFAULT_MODEL),
  temperature: z.number().min(0).max(2).default(0.1),
  maxOutputTokens: z.number().int().min(1).default(1024),
  timeoutMs: z.number().int().min(0).default(60_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred Gemini config type */
export type IGeminiConfig = z.infer<typeof GeminiConfigSchema>

export const GeminiTranslator: Translator<IGeminiConfig> = {
  name: 'gemini',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<IGeminiConfig>) {
    const cfg = opts.apiConfig
    const apiKey = cfg.apiKey
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const timeout = cfg.timeoutMs
    const model = cfg.model
    const temperature = cfg.temperature
    const maxOutputTokens = cfg.maxOutputTokens
    const retry = cfg.retry
    const langMap = cfg.langMap

    if (!apiKey) throw new Error(`Gemini Translate: missing 'apiKey'`)

    const promptResponses = await Promise.all(
      texts.map(async (text, idx) => {
        const context = _contexts[idx]
        const contextInfo = context ? `\nContext: ${context}` : ''

        const prompt = `Translate the following text from ${normalizeLocaleWithMap(opts.sourceLocale, langMap)} to ${normalizeLocaleWithMap(opts.targetLocale, langMap)}${contextInfo}.\n\nText to translate: "${text}"\n\nTranslation:`

        const url = `${endpoint}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
        const body = {
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generation_config: {
            temperature,
            max_output_tokens: maxOutputTokens
          }
        }

        try {
          const json = await withRetry(retry, () => postJson<any>(url, body, {}, timeout))
          const response = json?.candidates?.[0]?.content?.parts?.[0]?.text || text
          return response.trim().replace(/^["']|["']$/g, '').trim()
        } catch (error: any) {
          console.error(`Gemini translation error: ${error.message}`, error)
          return text
        }
      })
    )

    return promptResponses
  }
}
