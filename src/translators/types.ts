import type {
  IAzureConfig,
  IGoogleConfig,
  IDeepLConfig,
  IGeminiConfig,
  IOpenRouterConfig,
  INllbConfig,
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
  | INllbConfig
  | IMyMemoryConfig
  | ICopyConfig

export type ResolvedTranslatorEngine = Exclude<TranslatorEngine, 'auto'>

export type { TranslatorEngine }

export interface BulkTranslateOpts {
  sourceLocale: string
  targetLocale: string
  apiConfig: EngineConfig
  /** Absolute path to the workspace / project root used to resolve relative paths in engine config. */
  rootDir: string
}

export interface Translator {
  readonly name: string
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]>
}
