import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const GeminiTranslator: Translator = {
  name: 'gemini',

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const key = opts.apiConfig.key as string
    const endpoint =
      (opts.apiConfig.endpoint as string | undefined)?.replace(/\/+$/, '') ||
      'https://generativelanguage.googleapis.com/v1beta'
    const timeout = Number(opts.apiConfig.timeoutMs ?? 60000) // Longer timeout for LLM
    const model = opts.apiConfig.geminiModel || 'gemini-1.5-pro'
    const temperature = opts.apiConfig.temperature ?? 0.1
    const maxOutputTokens = opts.apiConfig.maxOutputTokens ?? 1024
    const retry = opts.apiConfig.retry

    // Use langMap from config, fallback to no mapping if not provided
    const langMap = opts.apiConfig.langMap || {}

    if (!key) throw new Error(`Gemini Translate: missing 'key'`)

    const promptResponses = await Promise.all(
      texts.map(async (text, idx) => {
        const context = contexts[idx]
        const contextInfo = context ? `\nContext: ${context}` : ''

        const prompt = `Translate the following text from ${normalizeLocaleWithMap(opts.sourceLocale, langMap)} to ${normalizeLocaleWithMap(opts.targetLocale, langMap)}${contextInfo}.\n\nText to translate: "${text}"\n\nTranslation:`

        const url = `${endpoint}/models/${model}:generateContent?key=${encodeURIComponent(key)}`
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
          // Clean up the response - remove quotes and extra whitespace
          return response.trim().replace(/^["']|["']$/g, '').trim()
        } catch (error: any) {
          console.error(`Gemini translation error: ${error.message}`, error)
          return text // Return original text on error
        }
      })
    )

    return promptResponses
  }
}
