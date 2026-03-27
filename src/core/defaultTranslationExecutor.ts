import { ITranslationExecutor } from './translationExecutor'
import { IUri, FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'
import { TranslationCache } from './cache/sqlite'
import { ResolvedTranslatorEngine, EngineConfig } from '../translators/types'
import { bulkTranslateWithEngine, TranslationStats } from '../bulkTranslate'
import {
  snapshotEnvVars,
  resolveAndValidateEngineConfig,
  type GetPassphrase
} from './config'

interface CachedEngineConfigEntry {
  signature: string
  config: EngineConfig
}

/**
 * Default implementation that actually performs translations and writes files
 */
export class DefaultTranslationExecutor implements ITranslationExecutor {
  private readonly runtimeEngineConfigCache = new Map<
    ResolvedTranslatorEngine,
    CachedEngineConfigEntry
  >()

  constructor(
    private fileSystem: FileSystem,
    private logger: Logger,
    private cache: TranslationCache,
    private workspacePath: string,
    private getPassphrase?: GetPassphrase
  ) {}

    /**
   * Translate segments using actual translation service
   */
  async translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: ResolvedTranslatorEngine,
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

    const resolvedEngineConfig = this.resolveRuntimeEngineConfig(
      engineName,
      engineConfig
    )

    // Perform actual translation
    return await bulkTranslateWithEngine(
      segments,
      contexts,
      engineName,
      {
        source: sourceLocale,
        target: targetLocale,
        apiConfig: resolvedEngineConfig,
        rootDir: this.workspacePath
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

  resetRuntimeState(): void {
    this.runtimeEngineConfigCache.clear()
  }

  private resolveRuntimeEngineConfig(
    engineName: ResolvedTranslatorEngine,
    engineConfig: EngineConfig
  ): EngineConfig {
    const signature = JSON.stringify(engineConfig)
    const cached = this.runtimeEngineConfigCache.get(engineName)

    if (cached && cached.signature === signature) {
      return cached.config
    }

    const envVars = snapshotEnvVars()
    const resolved = resolveAndValidateEngineConfig(
      engineName,
      engineConfig,
      envVars,
      this.logger,
      this.getPassphrase
    )

    if (!resolved) {
      throw new Error(`No configuration found for engine '${engineName}'`)
    }

    this.runtimeEngineConfigCache.set(engineName, {
      signature,
      config: resolved
    })

    return resolved
  }
}