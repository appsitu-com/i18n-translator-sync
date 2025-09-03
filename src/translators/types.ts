
interface TranslatorConfigBase {
  key: string
  endpoint: string
  timeoutMs?: number
}

export interface AzureConfig extends TranslatorConfigBase {
  engine: 'azure'
  region: string
  // textType?: string; // I think it will autodetect HTML vs plain text when unspecified
  category?: string
  batchSize?: number
  azureModel?: string
}

export interface GoogleConfig extends TranslatorConfigBase {
  engine: 'google'
  googleModel?: string
}

export interface DeepLConfig extends TranslatorConfigBase {
  engine: 'deepl'
  free?: boolean
  formality?: string
  deeplModel?: string
}

export interface MyMemoryConfig extends TranslatorConfigBase {
  engine: 'mymemory'
  email?: string
  throttleMs?: number
  maxRetries?: number
}

interface CopyConfig {
  engine: 'copy'
}

export type TranslatorApiConfig = AzureConfig | GoogleConfig | DeepLConfig | MyMemoryConfig| CopyConfig
export type TranslatorEngine = TranslatorApiConfig['engine']

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
