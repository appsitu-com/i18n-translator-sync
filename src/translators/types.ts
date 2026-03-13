import type {
  IAzureConfig,
  IGoogleConfig,
  IDeepLConfig,
  IGeminiConfig,
  IOpenRouterConfig,
  IMyMemoryConfig,
  ICopyConfig,
  TranslatorEngine
} from '../core/config'

/** Union of all typed engine configurations from the Zod schema. */
export type EngineConfig =
  | IAzureConfig
  | IGoogleConfig
  | IDeepLConfig
  | IGeminiConfig
  | IOpenRouterConfig
  | IMyMemoryConfig
  | ICopyConfig

export type ResolvedTranslatorEngine = Exclude<TranslatorEngine, 'auto'>

export type { TranslatorEngine }

export interface BulkTranslateOpts {
  sourceLocale: string
  targetLocale: string
  apiConfig: EngineConfig
}

export interface Translator {
  readonly name: string
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]>
}
