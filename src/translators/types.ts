import { RetryOptions } from "../util/retry"

export interface TranslatorApiConfig {
  key: string
  endpoint: string
  timeoutMs?: number
  retry?: RetryOptions

  // Language mapping configuration
  langMap?: Record<string, string>

  // engine: 'azure'
  region?: string

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

  // engine: 'openrouter'
  openrouterModel?: string
  systemPrompt?: string

  // engine: 'mymemory'
  email?: string
}

export type TranslatorEngine = 'azure' | 'google' | 'deepl' | 'mymemory' | 'gemini' | 'openrouter' | 'copy'

export interface BulkTranslateOpts {
  sourceLocale: string
  targetLocale: string
  apiConfig: TranslatorApiConfig
}

export interface Translator {
  readonly name: string
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]>
}
