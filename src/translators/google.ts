import type { BulkTranslateOpts, Translator } from './types'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'

interface GoogleV3TranslateResponse {
  translations?: Array<{
    translatedText?: string
  }>
}

export const GoogleTranslator: Translator = {
  name: 'google',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const key = opts.apiConfig.key
    const endpoint = (opts.apiConfig.endpoint || opts.apiConfig.url || 'https://translation.googleapis.com').replace(/\/+$/, '')
    const timeout = Number(opts.apiConfig.timeoutMs ?? 30000)
    const retry = opts.apiConfig.retry
    const model = opts.apiConfig.googleModel
    const projectId = opts.apiConfig.googleProjectId
    const location = opts.apiConfig.googleLocation || 'global'
    const langMap = opts.apiConfig.langMap || {}

    if (!key) throw new Error("Google Translate v3: missing 'key'")
    if (!projectId) throw new Error("Google Translate v3: missing 'googleProjectId'")

    const parent = `projects/${projectId}/locations/${location}`
    const url = `${endpoint}/v3/${parent}:translateText?key=${encodeURIComponent(key)}`
    const body: {
      contents: string[]
      sourceLanguageCode: string
      targetLanguageCode: string
      mimeType: 'text/plain'
      model?: string
    } = {
      sourceLanguageCode: normalizeLocaleWithMap(opts.sourceLocale, langMap),
      targetLanguageCode: normalizeLocaleWithMap(opts.targetLocale, langMap),
      contents: texts,
      mimeType: 'text/plain'
    }

    if (model) {
      body.model = model
    }

    const json = await withRetry(retry, () => postJson<GoogleV3TranslateResponse>(url, body, {}, timeout))
    const translations = json.translations || []
    return texts.map((text, index) => translations[index]?.translatedText ?? text)
  }
}
