import { RetryOptions } from "../util/retry"

export interface TranslatorApiConfig {
  key: string
  endpoint: string
  timeoutMs?: number
  retry?: RetryOptions

  // engine: 'azure'
  region: string
  // textType?: string; // I think it will autodetect HTML vs plain text when unspecified
  category?: string
  batchSize?: number
  azureModel?: string

  // engine: 'google'
  googleModel?: string

  // engine: 'deepl'
  free?: boolean
  formality?: string
  deeplModel?: string

  // engine: 'gemini'
  geminiModel?: string
  temperature?: number
  maxOutputTokens?: number

  // engine: 'mymemory'
  email?: string
}

export type TranslatorEngine = 'azure' | 'google' | 'deepl' | 'mymemory' | 'gemini' | 'copy'

export interface BulkTranslateOpts {
  sourceLocale: string
  targetLocale: string
  apiConfig: TranslatorApiConfig
}

export interface Translator {
  readonly name: string
  normalizeLocale(locale: string): string
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]>
}
