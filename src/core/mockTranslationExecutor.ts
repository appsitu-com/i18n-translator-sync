import { ITranslationExecutor, TranslationCommand } from './translationExecutor'
import { IUri, FileSystem } from './util/fs'
import { TranslatorEngine, EngineConfig } from '../translators/types'
import { TranslationStats } from '../bulkTranslate'

/**
 * Mock implementation for testing that captures translation commands instead of executing them
 * This allows tests to verify what translations would be performed without actually performing them
 */
export class MockTranslationExecutor implements ITranslationExecutor {
  private _commands: TranslationCommand[] = []
  private fileSystem?: FileSystem

  constructor(fileSystem?: FileSystem) {
    this.fileSystem = fileSystem
  }

  /**
   * Get all captured translation commands
   */
  get commands(): ReadonlyArray<TranslationCommand> {
    return this._commands
  }

  /**
   * Clear all captured commands
   */
  clearCommands(): void {
    this._commands = []
  }

  /**
   * Get all translation commands (excluding write commands)
   */
  get translationCommands(): ReadonlyArray<TranslationCommand> {
    return this._commands.filter(cmd => cmd.type === 'translate')
  }

  /**
   * Get all write commands (excluding translation commands)
   */
  get writeCommands(): ReadonlyArray<TranslationCommand> {
    return this._commands.filter(cmd => cmd.type === 'write')
  }

  /**
   * Get commands for a specific source file
   */
  getCommandsForFile(sourceFile: string): ReadonlyArray<TranslationCommand> {
    return this._commands.filter(cmd => cmd.sourceFile === sourceFile)
  }

  /**
   * Get translation pairs (source → target locale combinations)
   */
  get translationPairs(): ReadonlyArray<{ source: string; target: string; engine: TranslatorEngine; isBackTranslation: boolean; sourceFile: string }> {
    return this.translationCommands.map(cmd => ({
      source: cmd.sourceLocale!,
      target: cmd.targetLocale!,
      engine: cmd.engine!,
      isBackTranslation: cmd.isBackTranslation || false,
      sourceFile: cmd.sourceFile!
    }))
  }

  /**
   * Get target files that would be written
   */
  get targetFiles(): ReadonlyArray<{ uri: IUri; sourceFile: string; isBackTranslation: boolean }> {
    return this.writeCommands.map(cmd => ({
      uri: cmd.targetUri!,
      sourceFile: cmd.sourceFile!,
      isBackTranslation: cmd.isBackTranslation || false
    }))
  }

  /**
   * Mock translation that captures the command instead of performing actual translation
   */
  async translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: TranslatorEngine,
    sourceLocale: string,
    targetLocale: string,
    _engineConfig: EngineConfig | undefined,
    sourceFile: string,
    isBackTranslation: boolean,
  ): Promise<{ translations: string[]; stats: TranslationStats }> {
    // Capture the translation command
    this._commands.push({
      type: 'translate',
      segments: [...segments], // Copy to avoid mutation
      contexts: [...contexts], // Copy to avoid mutation
      engine: engineName,
      sourceLocale,
      targetLocale,
      sourceFile,
      isBackTranslation
    })

    // Return mock translated segments (just prefix with [TRANSLATED])
    const translations = segments.map(segment => `[TRANSLATED:${sourceLocale}->${targetLocale}] ${segment}`)

    const stats: TranslationStats = {
      apiCalls: segments.length,
      cacheHits: 0,
      total: segments.length
    }

    return { translations, stats }
  }

  /**
   * Mock write that captures the command instead of performing actual file write
   */
  async writeTranslation(
    targetUri: IUri,
    content: string,
    sourceFile: string,
    isBackTranslation: boolean
  ): Promise<void> {
    // Capture the write command
    this._commands.push({
      type: 'write',
      targetUri,
      content,
      sourceFile,
      isBackTranslation
    })

    // If filesystem is provided, simulate the write so other pipeline logic can see the file exists
    if (this.fileSystem) {
      try {
        await this.fileSystem.writeFile(targetUri, content)
      } catch {
        // Ignore errors in mock mode
      }
    }
  }

  /**
   * Get a summary of what would be translated
   */
  getSummary(): {
    totalTranslations: number
    totalWrites: number
    uniqueSourceFiles: number
    translationPairs: string[]
    targetFiles: string[]
  } {
    const uniqueSourceFiles = new Set(this._commands.map(cmd => cmd.sourceFile)).size
    const translationPairs = this.translationPairs.map(pair =>
      `${pair.sourceFile}: ${pair.source} → ${pair.target} (${pair.engine})${pair.isBackTranslation ? ' [back]' : ''}`
    )
    const targetFiles = this.targetFiles.map(file =>
      `${file.uri.fsPath}${file.isBackTranslation ? ' [back]' : ''}`
    )

    return {
      totalTranslations: this.translationCommands.length,
      totalWrites: this.writeCommands.length,
      uniqueSourceFiles,
      translationPairs,
      targetFiles
    }
  }
}