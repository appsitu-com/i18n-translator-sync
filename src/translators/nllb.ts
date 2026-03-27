import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { normalizeLocaleWithMap } from '../util/localeNorm'
import { ISO_TO_NLLB_LOCALE, NLLB_LOCALE_TO_LANGUAGE_NAME, NLLB_SUPPORTED_SCRIPT_LOCALE_CODES } from './nllbLanguageMap'
import { OPENROUTER_ALLOWED_DOMAINS } from './openrouter'

/** Default OpenRouter endpoint for NLLB model */
export const NLLB_DEFAULT_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/** Default separator for splitting NLLB-translated segments */
export const NLLB_DEFAULT_SEPARATOR = '<<<SEP>>>'

/** Default model for NLLB via OpenRouter */
export const NLLB_DEFAULT_MODEL = 'meta-llama/nllb-200-1.3B'

/** NLLB uses OpenRouter domains plus localhost for local endpoints (any port). */
export const NLLB_ALLOWED_DOMAINS = [...OPENROUTER_ALLOWED_DOMAINS, 'localhost'] as const

/** NLLB via OpenRouter config schema */
export const NllbConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(NLLB_DEFAULT_OPENROUTER_ENDPOINT),
  model: z.string().default(NLLB_DEFAULT_MODEL),
  temperature: z.number().min(0).max(2).default(0),
  maxOutputTokens: z.number().int().min(1).default(256),
  separator: z.string().default(NLLB_DEFAULT_SEPARATOR),
  timeoutMs: z.number().int().min(0).default(60_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred NLLB config type */
export type INllbConfig = z.infer<typeof NllbConfigSchema>

function findNllbLocaleByLanguagePrefix(languagePrefix: string): string | undefined {
  const prefix = languagePrefix.toLowerCase() + '_'
  for (const locale of Object.keys(NLLB_LOCALE_TO_LANGUAGE_NAME)) {
    if (locale.toLowerCase().startsWith(prefix)) {
      return locale
    }
  }
  return undefined
}

function toNllbLocale(locale: string, langMap: Record<string, string>): string {
  const mapped = normalizeLocaleWithMap(locale, langMap)

  if (NLLB_SUPPORTED_SCRIPT_LOCALE_CODES.has(mapped)) {
    return mapped
  }

  const shortCode = mapped.toLowerCase().split(/[-_]/)[0]

  // Try ISO_TO_NLLB_LOCALE mapping first
  const fallback = ISO_TO_NLLB_LOCALE[shortCode]
  if (fallback && NLLB_SUPPORTED_SCRIPT_LOCALE_CODES.has(fallback)) {
    return fallback
  }

  // Search for first NLLB locale matching the language prefix
  const prefixMatch = findNllbLocaleByLanguagePrefix(shortCode)
  if (prefixMatch) {
    return prefixMatch
  }

  throw new Error(`NLLB Translator: unsupported locale '${locale}'. Map it to a supported NLLB code via translator.nllb.langMap (for example 'en' -> 'eng_Latn').`)
}

function parseTranslationsFromResponse(responseText: string, separator: string, expectedCount: number): string[] {
  const lines = responseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const joined = lines.join('\n')
  const chunks = joined
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (chunks.length === expectedCount) {
    return chunks
  }

  throw new Error(`NLLB Translator: expected ${expectedCount} translated segments but received ${chunks.length}.`)
}

export const NllbTranslator: Translator<INllbConfig> = {
  name: 'nllb',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<INllbConfig>) {
    const cfg = opts.apiConfig
    const apiKey = cfg.apiKey
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const model = cfg.model
    const temperature = cfg.temperature
    const maxTokens = cfg.maxOutputTokens
    const separator = cfg.separator
    const timeout = cfg.timeoutMs
    const retry = cfg.retry
    const langMap = cfg.langMap

    if (!apiKey) {
      throw new Error(`NLLB Translator: missing 'apiKey'`)
    }

    const sourceLocale = toNllbLocale(opts.sourceLocale, langMap)
    const targetLocale = toNllbLocale(opts.targetLocale, langMap)
    const sourceLanguage = NLLB_LOCALE_TO_LANGUAGE_NAME[sourceLocale]
    const targetLanguage = NLLB_LOCALE_TO_LANGUAGE_NAME[targetLocale]

    const payload = texts.join(`\n${separator}\n`)

    const contextHints = _contexts.some((ctx) => Boolean(ctx))
      ? '\n\nContext hints (aligned by input order):\n' +
        _contexts
          .map((ctx, idx) => {
            if (!ctx) {
              return `${idx + 1}. (none)`
            }
            return `${idx + 1}. ${ctx}`
          })
          .join('\n')
      : ''

    const prompt = [
      `Translate from ${sourceLanguage} (${sourceLocale}) to ${targetLanguage} (${targetLocale}).`,
      `Keep the separator ${separator} exactly as is.`,
      'Return only translated text segments joined by the same separator. Do not add explanations, numbering, markdown, or extra separators.',
      contextHints,
      '',
      payload
    ].join('\n')

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/appsitu-com/i18n-translator-sync',
      'X-Title': 'VSCode i18n Translator Extension'
    }

    const body: {
      model?: string
      messages: Array<{ role: 'user'; content: string }>
      temperature: number
      max_tokens: number
    } = {
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens
    }

    if (model) {
      body.model = model
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`)
      }

      const text = await response.text()
      const json = text ? JSON.parse(text) : {}
      const responseContent = json?.choices?.[0]?.message?.content

      if (typeof responseContent !== 'string' || responseContent.trim().length === 0) {
        throw new Error('NLLB Translator: empty response content')
      }

      return parseTranslationsFromResponse(responseContent, separator, texts.length)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`NLLB translation error: ${message}`)
    }
  }
}
