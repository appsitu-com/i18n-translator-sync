import { ITranslationExecutor } from './translationExecutor'
import { IUri, IFileSystem } from './util/fs'
import { ILogger } from './util/baseLogger'
import { ITranslationMemory } from './tm/ITranslationMemory'
import { ResolvedTranslatorEngine, EngineConfig } from '../translators/types'
import { bulkTranslateWithEngine, ITranslationStats } from '../bulkTranslate'
import {
  snapshotEnvVars,
  resolveAndValidateEngineConfig,
  type GetPassphrase
} from './config'

interface CachedEngineConfigEntry {
  signature: string
  config: EngineConfig
}

type EdgeWhitespaceParts = {
  leading: string
  core: string
  trailing: string
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
    private fileSystem: IFileSystem,
    private logger: ILogger,
    private tm: ITranslationMemory,
    private workspacePath: string,
    private getPassphrase?: GetPassphrase
  ) {}

  private splitEdgeWhitespace(text: string): EdgeWhitespaceParts {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
    if (!match) {
      return { leading: '', core: text, trailing: '' }
    }

    return {
      leading: match[1],
      core: match[2],
      trailing: match[3]
    }
  }

  private restoreEdgeWhitespace(
    originalParts: EdgeWhitespaceParts[],
    translatedCoreSegments: string[]
  ): string[] {
    return originalParts.map((parts, index) => {
      const translatedCore = translatedCoreSegments[index] ?? parts.core
      return `${parts.leading}${translatedCore}${parts.trailing}`
    })
  }

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
    segmentPositions?: (number | string)[],
  ): Promise<{ translations: string[]; stats: ITranslationStats }> {
    const partsBySegment = segments.map((segment) => this.splitEdgeWhitespace(segment))
    const trimmedSegments = partsBySegment.map((parts) => parts.core)

    const nonEmptyIndexes = trimmedSegments
      .map((segment, index) => (segment.length > 0 ? index : -1))
      .filter((index) => index >= 0)

    if (nonEmptyIndexes.length === 0) {
      return {
        translations: segments.slice(),
        stats: {
          apiCalls: 0,
          cacheHits: 0,
          total: 0
        }
      }
    }

    const trimmedNonEmptySegments = nonEmptyIndexes.map((index) => trimmedSegments[index])
    const contextsForTranslation = nonEmptyIndexes.map((index) => contexts[index] ?? null)
    const positionsForTranslation = segmentPositions
      ? nonEmptyIndexes.map((index) => segmentPositions[index])
      : undefined

    // If using copy engine, just return original segments
    if (engineName === 'copy') {
      const restoredCopySegments = this.restoreEdgeWhitespace(partsBySegment, trimmedSegments)
      return {
        translations: restoredCopySegments,
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

    // Perform actual translation on trimmed, non-empty cores only.
    const translatedResult = await bulkTranslateWithEngine(
      trimmedNonEmptySegments,
      contextsForTranslation,
      engineName,
      {
        source: sourceLocale,
        target: targetLocale,
        apiConfig: resolvedEngineConfig,
        rootDir: this.workspacePath
      },
      this.tm,
      sourceFile,
      positionsForTranslation
    )

    const translatedCores = trimmedSegments.slice()
    nonEmptyIndexes.forEach((segmentIndex, translatedIndex) => {
      translatedCores[segmentIndex] = translatedResult.translations[translatedIndex] ?? trimmedSegments[segmentIndex]
    })

    return {
      translations: this.restoreEdgeWhitespace(partsBySegment, translatedCores),
      stats: translatedResult.stats
    }
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