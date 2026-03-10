import type { Translator, BulkTranslateOpts } from './types'
import type { IGeminiConfig } from '../core/config'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const GeminiTranslator: Translator = {
  name: 'gemini',

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const cfg = opts.apiConfig as IGeminiConfig
    const apiKey = cfg.apiKey
    const endpoint = (cfg.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    const timeout = Number(cfg.timeoutMs ?? 60_000)
    const model = cfg.geminiModel ?? 'gemini-pro'
    const temperature = cfg.temperature ?? 0.1
    const maxOutputTokens = cfg.maxOutputTokens ?? 1024
    const retry = cfg.retry
    const langMap = cfg.langMap ?? {}

    if (!apiKey) throw new Error(`Gemini Translate: missing 'apiKey'`)

    const promptResponses = await Promise.all(
      texts.map(async (text, idx) => {
        const context = contexts[idx]
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
