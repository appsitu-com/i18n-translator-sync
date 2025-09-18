import { IUri } from './util/fs'
import { TranslatorEngine } from '../translators/types'

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
   * @param configProvider Configuration provider for engine settings
   * @param sourceFile Source file path for context
   * @param isBackTranslation Whether this is a back-translation
   * @returns Translated segments
   */
  translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: TranslatorEngine,
    sourceLocale: string,
    targetLocale: string,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    sourceFile: string,
    isBackTranslation: boolean
  ): Promise<string[]>

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