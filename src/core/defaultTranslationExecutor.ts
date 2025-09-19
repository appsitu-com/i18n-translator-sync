import { ITranslationExecutor } from './translationExecutor'
import { IUri, FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'
import { TranslationCache } from './cache/sqlite'
import { TranslatorEngine, TranslatorApiConfig } from '../translators/types'
import { bulkTranslateWithEngine } from '../bulkTranslate'
import { resolveEnvDeep } from './util/environmentSetup'

/**
 * Default implementation that actually performs translations and writes files
 */
export class DefaultTranslationExecutor implements ITranslationExecutor {
  constructor(
    private fileSystem: FileSystem,
    private logger: Logger,
    private cache: TranslationCache
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
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    _sourceFile: string,
    _isBackTranslation: boolean
  ): Promise<string[]> {
    // If using copy engine, just return original segments
    if (engineName === 'copy') {
      return segments.slice()
    }

    // Get engine configuration
    const apiConfig = this.getEngineConfig(engineName, configProvider)

    // Perform actual translation
    return await bulkTranslateWithEngine(
      segments,
      contexts,
      engineName,
      {
        source: sourceLocale,
        target: targetLocale,
        apiConfig
      },
      this.cache
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
   * Get engine configuration for the given engine name
   */
  private getEngineConfig(
    engineName: TranslatorEngine,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T }
  ): TranslatorApiConfig {
    const rawConfig = configProvider.get(engineName)

    if (!rawConfig) {
      throw new Error(`Missing configuration for translation engine '${engineName}'`)
    }

    // Resolve environment variables in configuration
    return resolveEnvDeep(rawConfig, this.logger) as TranslatorApiConfig
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