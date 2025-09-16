import type { Translator, BulkTranslateOpts } from './types'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'

// Language code mapping for Gemini
// Gemini supports standard language codes but we'll normalize some variants
const langMap: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-Hans': 'zh',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-TW',
  'zh-Hant': 'zh-TW',
  'fr-CA': 'fr',
  'fr-FR': 'fr',
  'pt-PT': 'pt',
  'pt-BR': 'pt',
  'en-US': 'en',
  'en-GB': 'en',
  'es-419': 'es',
  'es-ES': 'es'
}

function norm(locale: string): string {
  return langMap[locale] ?? locale.split('-')[0].toLowerCase()
}

export const GeminiTranslator: Translator = {
  name: 'gemini',
  normalizeLocale(locale: string) {
    return norm(locale)
  },

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

    if (!key) throw new Error(`Gemini Translate: missing 'key'`)

    // Process in batches to avoid large payloads
    const batchSize = 5
    const results: string[] = new Array(texts.length)

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const batchContexts = contexts.slice(i, i + batchSize)

      // Construct prompts for each text
      const promptResponses = await Promise.all(
        batch.map(async (text, idx) => {
          const context = batchContexts[idx]
          const contextInfo = context ? `\nContext: ${context}` : ''

          const prompt = `Translate the following text from ${norm(opts.sourceLocale)} to ${norm(opts.targetLocale)}${contextInfo}.\n\nText to translate: "${text}"\n\nTranslation:`

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

      // Add batch results to the overall results
      for (let j = 0; j < promptResponses.length; j++) {
        results[i + j] = promptResponses[j]
      }
    }

    return results
  }
}
