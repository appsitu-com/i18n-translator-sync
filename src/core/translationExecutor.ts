import { IUri } from './util/fs'
import { TranslatorEngine, EngineConfig } from '../translators/types'
import { TranslationStats } from '../bulkTranslate'

/**
 * Represents a single translation command that would be executed
 */
export interface TranslationCommand {
  /** Type of operation */
  type: 'translate' | 'write'
  /** Source segments to translate (for translate operations) */
  segments?: string[]
  /** Context information for segments (for translate operations) */
  contexts?: (string | null)[]
  /** Translation engine to use */
  engine?: TranslatorEngine
  /** Source locale */
  sourceLocale?: string
  /** Target locale */
  targetLocale?: string
  /** URI of the file to write (for write operations) */
  targetUri?: IUri
  /** Content to write (for write operations) */
  content?: string
  /** Source file path for context */
  sourceFile?: string
  /** Whether this is a back-translation */
  isBackTranslation?: boolean
}

/**
 * Interface for executing translations. Can be implemented to either:
 * - Actually perform translations (DefaultTranslationExecutor)
 * - Capture translation commands for testing/dry-run (MockTranslationExecutor)
 */
export interface ITranslationExecutor {
  /**
   * Translate text segments from source to target language
   * @param segments Text segments to translate
   * @param contexts Context information for each segment
   * @param engineName Translation engine to use
   * @param sourceLocale Source language locale
   * @param targetLocale Target language locale
   * @param engineConfig Resolved engine configuration from ITranslatorConfig
   * @param sourceFile Source file path for context
   * @param isBackTranslation Whether this is a back-translation
   * @returns Object with translated segments and statistics
   */
  translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: TranslatorEngine,
    sourceLocale: string,
    targetLocale: string,
    engineConfig: EngineConfig | undefined,
    sourceFile: string,
    isBackTranslation: boolean,
  ): Promise<{ translations: string[]; stats: TranslationStats }>

  /**
   * Write content to a target file
   * @param targetUri Target file URI
   * @param content Content to write
   * @param sourceFile Source file path for context
   * @param isBackTranslation Whether this is a back-translation
   */
  writeTranslation(
    targetUri: IUri,
    content: string,
    sourceFile: string,
    isBackTranslation: boolean
  ): Promise<void>
}