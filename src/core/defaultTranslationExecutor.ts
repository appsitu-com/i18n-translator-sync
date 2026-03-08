import { ITranslationExecutor } from './translationExecutor'
import { IUri, FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'
import { TranslationCache } from './cache/sqlite'
import { TranslatorEngine, TranslatorApiConfig } from '../translators/types'
import { bulkTranslateWithEngine, TranslationStats } from '../bulkTranslate'
import { resolveEnvDeep, resolveEnvObjectWithDecryption } from './util/environmentSetup'

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
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    sourceFile: string,
    _isBackTranslation: boolean,
    passphrase?: string
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

    // Get engine configuration
    const apiConfig = this.getEngineConfig(engineName, configProvider, passphrase)

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
   * Get engine configuration for the given engine name
   *
   * @param engineName The name of the translation engine
   * @param configProvider The configuration provider
   * @param passphrase Optional passphrase for API key decryption
   * @returns The resolved API configuration
   */
  private getEngineConfig(
    engineName: TranslatorEngine,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    passphrase?: string
  ): TranslatorApiConfig {
    const rawConfig = configProvider.get(engineName)

    if (!rawConfig) {
      throw new Error(`Missing configuration for translation engine '${engineName}'`)
    }

    // Resolve environment variables in configuration
    if (passphrase) {
      // Create a simple passphrase getter function
      const getPassphrase = () => passphrase;

      // Use version with passphrase for decryption
      return resolveEnvObjectWithDecryption(rawConfig, this.logger, getPassphrase, this.workspacePath) as TranslatorApiConfig;
    } else {
      // Fallback to synchronous version (may fail for encrypted values)
      return resolveEnvDeep(rawConfig, this.logger, this.workspacePath) as TranslatorApiConfig;
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