import { z } from 'zod'
import type { ITranslator, IBulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { normalizeLocaleWithMap, toLanguage } from '../util/localeNorm'

const VARIABLE_REGEX = /\{[^}]+\}/g
const EDEN_AI_DEFAULT_PATH = '/v2/translation/automatic_translation'
const EDEN_AI_PROVIDER = 'deepl'

interface ProtectedTextResult {
  protectedText: string
  placeholders: string[]
}

interface DeepLTranslationResponse {
  translations?: Array<{ text?: string }>
}

interface EdenAiTranslationResponse {
  items?: unknown[]
  [EDEN_AI_PROVIDER]?: {
    text?: string
    translated_text?: string
    translations?: Array<{ text?: string; translated_text?: string }>
  }
}

function protectVariablesWithXmlTags(text: string): ProtectedTextResult {
  const placeholders = text.match(VARIABLE_REGEX) ?? []
  if (placeholders.length === 0) {
    return { protectedText: text, placeholders }
  }

  let index = 0
  const protectedText = text.replace(VARIABLE_REGEX, () => {
    index += 1
    return `<x id="${index}">${placeholders[index - 1]}</x>`
  })

  return { protectedText, placeholders }
}

function restoreVariablesFromXmlTags(translatedText: string, placeholders: string[]): string {
  if (placeholders.length === 0) {
    return translatedText
  }

  const withWrappedTagsRestored = translatedText.replace(/<x\b[^>]*\bid="(\d+)"[^>]*>[\s\S]*?<\/x>/gi, (_full, id: string) => {
    const placeholder = placeholders[Number(id) - 1]
    return placeholder ?? _full
  })

  return withWrappedTagsRestored.replace(/<x\b[^>]*\bid="(\d+)"[^>]*\/>/gi, (_full, id: string) => {
    const placeholder = placeholders[Number(id) - 1]
    return placeholder ?? _full
  })
}

function isEdenAiEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).hostname.endsWith('edenai.run')
  } catch {
    return false
  }
}

function getEdenAiUrl(endpoint: string): string {
  const parsed = new URL(endpoint)
  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = EDEN_AI_DEFAULT_PATH
  }
  return parsed.toString().replace(/\/+$/, '')
}

function extractEdenAiTranslation(json: EdenAiTranslationResponse): string | null {
  const providerPayload = json?.[EDEN_AI_PROVIDER]
  const providerText = providerPayload?.translated_text ?? providerPayload?.text
  if (providerText) {
    return providerText
  }

  const providerFirst = providerPayload?.translations?.[0]
  const providerFirstText = providerFirst?.translated_text ?? providerFirst?.text
  if (providerFirstText) {
    return providerFirstText
  }

  const firstItem = json?.items?.[0] as
    | { translated_text?: string; text?: string; translations?: Array<{ translated_text?: string; text?: string }> }
    | undefined
  const itemText = firstItem?.translated_text ?? firstItem?.text
  if (itemText) {
    return itemText
  }

  const firstItemTranslation = firstItem?.translations?.[0]
  return firstItemTranslation?.translated_text ?? firstItemTranslation?.text ?? null
}

function toEdenLanguageCode(locale: string): string {
  return locale.toLowerCase()
}

async function translateChunkWithEdenAi(
  chunk: string[],
  protectedChunk: ProtectedTextResult[],
  endpoint: string,
  authKey: string,
  timeout: number,
  sourceLocale: string,
  targetLocale: string,
  context: string
): Promise<string[]> {
  const url = getEdenAiUrl(endpoint)
  const headers = { Authorization: `Bearer ${authKey}` }

  const out: string[] = []
  for (let i = 0; i < protectedChunk.length; i++) {
    const requestBody: Record<string, unknown> = {
      providers: EDEN_AI_PROVIDER,
      text: protectedChunk[i].protectedText,
      source_language: toEdenLanguageCode(sourceLocale),
      target_language: toEdenLanguageCode(targetLocale)
    }

    if (context) {
      requestBody.context = context
    }

    const json = await postJson<EdenAiTranslationResponse>(url, requestBody, headers, timeout)
    const translated = extractEdenAiTranslation(json) ?? chunk[i]
    out.push(restoreVariablesFromXmlTags(translated, protectedChunk[i].placeholders))
  }

  return out
}

/** Default endpoints for DeepL */
export const DEEPL_DEFAULT_ENDPOINT_FREE = 'https://api-free.deepl.com'
export const DEEPL_DEFAULT_ENDPOINT = 'https://api.deepl.com'

/** Allowed domains for DeepL endpoint validation */
export const DEEPL_ALLOWED_DOMAINS = [
  'api-free.deepl.com',
  'api.deepl.com',
  '*.deepl.com',
  'api.edenai.run',
  '*.edenai.run'
] as const

/** DeepL Translation config schema */
export const DeepLConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(DEEPL_DEFAULT_ENDPOINT),
  formality: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number().int().min(0).default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred DeepL config type */
export type IDeepLConfig = z.infer<typeof DeepLConfigSchema>

export const DeepLTranslator: ITranslator<IDeepLConfig> = {
  name: 'deepl',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: IBulkTranslateOpts<IDeepLConfig>) {
    const cfg = opts.apiConfig
    const authKey = cfg.apiKey
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const timeout = cfg.timeoutMs
    const formality = cfg.formality
    const model_type = cfg.model
    const langMap = cfg.langMap
    const useEdenAi = isEdenAiEndpoint(cfg.endpoint)

    if (!authKey) throw new Error(`DeepL: missing 'apiKey'`)
    const headers = { Authorization: `DeepL-Auth-Key ${authKey}` }

    // DeepL documents uppercase locale codes

    // DeeL wants just the root language from a source_lang only but not for target_lang that can include region/script
    // https://developers.deepl.com/docs/getting-started/supported-languages
    const source_lang = toLanguage(normalizeLocaleWithMap(opts.sourceLocale, langMap)).toUpperCase()
    const target_lang = normalizeLocaleWithMap(opts.targetLocale, langMap).toUpperCase()
    const sourceLocale = normalizeLocaleWithMap(opts.sourceLocale, langMap)
    const targetLocale = normalizeLocaleWithMap(opts.targetLocale, langMap)

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
      const protectedChunk = chunk.map((text) => protectVariablesWithXmlTags(text))
      if (useEdenAi) {
        const edenTranslations = await translateChunkWithEdenAi(
          chunk,
          protectedChunk,
          endpoint,
          authKey,
          timeout,
          sourceLocale,
          targetLocale,
          ctx
        )

        for (let k = 0; k < idxs.length; k++) {
          out[idxs[k]] = edenTranslations[k] ?? chunk[k]
        }
      } else {
        const requestTexts = protectedChunk.map((entry) => entry.protectedText)
        const hasProtectedVariables = protectedChunk.some((entry) => entry.placeholders.length > 0)
        const url = `${endpoint}/v2/translate`
        const body: Record<string, unknown> = { text: requestTexts, source_lang, target_lang }

        if (ctx) body.context = ctx
        if (formality) body.formality = formality
        if (model_type) body.model_type = model_type
        if (hasProtectedVariables) {
          body.tag_handling = 'xml'
          body.ignore_tags = ['x']
        }

        const json = await postJson<DeepLTranslationResponse>(url, body, headers, timeout)

        const trans = json?.translations ?? []
        for (let k = 0; k < idxs.length; k++) {
          const translated = trans[k]?.text ?? chunk[k]
          out[idxs[k]] = restoreVariablesFromXmlTags(translated, protectedChunk[k].placeholders)
        }
      }
    }
    return out
  }
}
