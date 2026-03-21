import type { IAzureConfig } from './azure'
import type { IGoogleConfig } from './google'
import type { IDeepLConfig } from './deepl'
import type { IGeminiConfig } from './gemini'
import type { IOpenRouterConfig } from './openrouter'
import type { INllbConfig } from './nllb'
import type { IMyMemoryConfig } from './mymemory'
import type { ICopyConfig } from './copy'
import type { TranslatorEngine } from '../core/config/translatorConfigSchema'

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

export interface BulkTranslateOpts<T extends EngineConfig = EngineConfig> {
  sourceLocale: string
  targetLocale: string
  apiConfig: T
  /** Absolute path to the workspace / project root used to resolve relative paths in engine config. */
  rootDir: string
}

export interface Translator<T extends EngineConfig = EngineConfig> {
  readonly name: string
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts<T>): Promise<string[]>
}
