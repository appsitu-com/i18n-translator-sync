import { ITranslationExecutor } from './translationExecutor'
import { IUri, FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'
import { TranslationCache } from './cache/sqlite'
import { TranslatorEngine, EngineConfig } from '../translators/types'
import { bulkTranslateWithEngine, TranslationStats } from '../bulkTranslate'

/**
 * Default implementation that actually performs translations and writes files
 */
export class DefaultTranslationExecutor implements ITranslationExecutor {
  constructor(
    private fileSystem: FileSystem,
    private logger: Logger,
    private cache: TranslationCache,
    private workspacePath: string
  ) {}

    /**
   * Translate segments using actual translation service
   */
  async translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: TranslatorEngine,
    sourceLocale: string,
    targetLocale: string,
    engineConfig: EngineConfig | undefined,
    sourceFile: string,
    _isBackTranslation: boolean,
  ): Promise<{ translations: string[]; stats: TranslationStats }> {
    // If using copy engine, just return original segments
    if (engineName === 'copy') {
      return {
        translations: segments.slice(),
        stats: {
          apiCalls: 0,
          cacheHits: 0,
          total: 0
        }
      }
    }

    if (!engineConfig) {
      throw new Error(`No configuration found for engine '${engineName}'`)
    }

    // Perform actual translation
    return await bulkTranslateWithEngine(
      segments,
      contexts,
      engineName,
      {
        source: sourceLocale,
        target: targetLocale,
        apiConfig: engineConfig
      },
      this.cache,
      sourceFile
    )
  }

  /**
   * Write translated content to target file
   */
  async writeTranslation(
    targetUri: IUri,
    content: string,
    _sourceFile: string,
    _isBackTranslation: boolean
  ): Promise<void> {
    // Ensure directory exists
    await this.ensureDirFor(targetUri)

    try {
      await this.fileSystem.writeFile(targetUri, content)
    } catch (error) {
      this.logger.error(`Failed to write file ${targetUri.fsPath}: ${error}`)
      throw error
    }
  }

  /**
   * Ensure directory exists for a file
   */
  private async ensureDirFor(file: IUri): Promise<void> {
    try {
      await this.fileSystem.createDirectory(this.fileSystem.joinPath(file, '..'))
    } catch (error) {
      this.logger.error(`Failed to create directory for ${file.fsPath}: ${error}`)
      throw error
    }
  }
}