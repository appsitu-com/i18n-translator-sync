import type { Translator, BulkTranslateOpts } from './types'
import type { INllbConfig } from '../core/config'
import { normalizeLocaleWithMap } from '../util/localeNorm'
import { ISO_TO_NLLB_LOCALE, NLLB_LOCALE_TO_LANGUAGE_NAME, NLLB_SUPPORTED_LOCALES } from './nllbLanguageMap'

const DEFAULT_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_NLLB_MODEL = 'meta-llama/nllb-200-1.3B'
const DEFAULT_SEPARATOR = '<<<SEP>>>'

function toNllbLocale(locale: string, langMap: Record<string, string>): string {
  const mapped = normalizeLocaleWithMap(locale, langMap)

  if (NLLB_SUPPORTED_LOCALES.has(mapped)) {
    return mapped
  }

  const shortCode = mapped.toLowerCase().split(/[-_]/)[0]
  const fallback = ISO_TO_NLLB_LOCALE[shortCode]

  if (fallback && NLLB_SUPPORTED_LOCALES.has(fallback)) {
    return fallback
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

export const NllbTranslator: Translator = {
  name: 'nllb',

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]> {
    const cfg = opts.apiConfig as INllbConfig
    const apiKey = cfg.apiKey
    const endpoint = (cfg.endpoint || DEFAULT_OPENROUTER_ENDPOINT).replace(/\/+$/, '')
    const model = cfg.nllbModel || DEFAULT_NLLB_MODEL
    const temperature = cfg.temperature ?? 0
    const maxTokens = cfg.maxOutputTokens ?? 4096
    const separator = cfg.separator || DEFAULT_SEPARATOR
    const langMap = cfg.langMap ?? {}

    if (!apiKey) {
      throw new Error(`NLLB Translator: missing 'apiKey'`)
    }

    const sourceLocale = toNllbLocale(opts.sourceLocale, langMap)
    const targetLocale = toNllbLocale(opts.targetLocale, langMap)
    const sourceLanguage = NLLB_LOCALE_TO_LANGUAGE_NAME[sourceLocale]
    const targetLanguage = NLLB_LOCALE_TO_LANGUAGE_NAME[targetLocale]

    const payload = texts.join(`\n${separator}\n`)

    const contextHints = contexts.some((ctx) => Boolean(ctx))
      ? '\n\nContext hints (aligned by input order):\n' +
        contexts
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

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens
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
