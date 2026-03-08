import * as path from 'path'
import { FileSystem, IUri } from './util/fs'
import { Logger } from './util/baseLogger'
import { TranslationCache } from './cache/sqlite'
import { extractForFile, jsonPathToString } from '../extractors/extractorRegistry'
import { loadContextCsvForJson } from './contextCsv'
import { pickEngine } from '../translators/registry'
import { generateContextCsvWarnings } from './contextCsvWarnings'
import { TranslateProjectConfig } from './coreConfig'
import {
  getRelativePath,
  createTargetUri,
  createBackTranslationUri,
  findSourcePathForFile
} from './util/pathOperations'
import { ITranslationExecutor } from './translationExecutor'
import { DefaultTranslationExecutor } from './defaultTranslationExecutor'
import { IPassphraseManager } from './secrets/passphraseManager'

/**
 * Core translator pipeline service
 */
export class TranslatorPipeline {
  private fileSystem: FileSystem
  private logger: Logger
  private cache: TranslationCache
  private executor: ITranslationExecutor
  private passphraseManager?: IPassphraseManager

  constructor(
    fileSystem: FileSystem,
    logger: Logger,
    cache: TranslationCache,
    workspacePath: string,
    executor?: ITranslationExecutor,
    passphraseManager?: IPassphraseManager
  ) {
    this.fileSystem = fileSystem
    this.logger = logger
    this.cache = cache
    this.executor = executor || new DefaultTranslationExecutor(fileSystem, logger, cache, workspacePath)
    this.passphraseManager = passphraseManager
  }

  /**
   * Create engine override mapping from configuration
   */
  private createEngineOverrides(overrideCfg: Record<string, string[]>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(overrideCfg).flatMap(([engine, localePatterns]) =>
        localePatterns.flatMap((localePattern) => {
          const locale = localePattern.trim()
          return locale.match(/:/)
            ? [[locale, engine]] // locale is actually fromLocale:toLocale
            : [
                [`en:${locale}`, engine],
                [`${locale}:en`, engine]
              ]
        })
      )
    )
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

  /**
   * Copy a file verbatim to all target locale paths (copy-only mode).
   * Also copies to back-translation paths when enabled.
   */
  private async copyFileToTargets(
    srcUri: IUri,
    workspacePath: string,
    config: TranslateProjectConfig,
    forceTranslation: boolean
  ): Promise<void> {
    const content = await this.fileSystem.readFile(srcUri)
    const rel = getRelativePath(srcUri.fsPath, workspacePath, config)
    const sourceLocale = config.sourceLocale

    for (const targetLocale of config.targetLocales) {
      const sourcePath = findSourcePathForFile(srcUri.fsPath, workspacePath, config)
      if (!sourcePath) {
        throw new Error(`File ${srcUri.fsPath} is not in any configured source path`)
      }

      const targetUri = createTargetUri(
        this.fileSystem, workspacePath, sourceLocale, targetLocale, rel, config, sourcePath
      )

      const copyNeeded = forceTranslation || await this.needsTranslation(srcUri, targetUri)
      if (!copyNeeded) {
        this.logger.info(`Skipping up-to-date copy-only file: ${path.basename(srcUri.fsPath)} [${targetLocale}]`)
        continue
      }

      await this.ensureDirFor(targetUri)
      await this.fileSystem.writeFile(targetUri, content)
      this.logger.info(`Copied (copy-only): ${path.basename(srcUri.fsPath)} → ${targetLocale}`)

      if (config.enableBackTranslation) {
        const backUri = createBackTranslationUri(
          this.fileSystem, workspacePath, targetLocale, rel, config, sourcePath
        )
        await this.ensureDirFor(backUri)
        await this.fileSystem.writeFile(backUri, content)
        this.logger.info(`Copied (copy-only back): ${path.basename(srcUri.fsPath)} → ${targetLocale}_${sourceLocale}`)
      }
    }
  }

  /**
   * Handle context CSV loading for JSON files
   */
  private async loadJsonContexts(extraction: any, srcUri: IUri): Promise<(string | null)[]> {
    // Default to null contexts
    let contexts: (string | null)[] = new Array(extraction.segments.length).fill(null)

    if (extraction.kind !== 'json' && extraction.kind !== 'yaml') {
      return contexts
    }

    try {
      // Use our platform-agnostic contextCsv loader with the FileSystem instance
      const { map: ctxMap, stats } = await loadContextCsvForJson(this.fileSystem, srcUri);
      const validPaths = new Set(extraction.paths.map(jsonPathToString))

      // Generate context CSV warning messages
      const msgs = generateContextCsvWarnings(ctxMap, validPaths, stats)

      if (msgs.length) {
        this.logger.warn(
          `Context CSV issues in ${stats.fileUri?.fsPath || ''}: ${msgs.join(' | ')}`
        )
      }

      return extraction.makeContexts(ctxMap)
    } catch (error) {
      this.logger.warn(`Error loading context CSV: ${error}`)
      return contexts
    }
  }

  private async resolvePassphrase(): Promise<string | undefined> {
    if (!this.passphraseManager) {
      return undefined
    }

    if (!this.passphraseManager.hasPassphrase()) {
      await this.passphraseManager.loadPassphrase()
    }

    return this.passphraseManager.getPassphrase()
  }

  /**
   * Translate segments using specified engine
   */
  /**
   * Check if a target file needs to be translated by comparing timestamps
   * @returns true if target needs to be translated (doesn't exist or is older than source)
   */
  private async needsTranslation(sourceUri: IUri, targetUri: IUri): Promise<boolean> {
    try {
      // Check if target file exists
      const targetExists = await this.fileSystem.fileExists(targetUri)
      if (!targetExists) {
        // Target doesn't exist, needs translation
        return true
      }

      // Get timestamps of source and target files
      const sourceStats = await this.fileSystem.stat(sourceUri)
      const targetStats = await this.fileSystem.stat(targetUri)

      // Compare modification times - translate if source is newer
      return sourceStats.mtime > targetStats.mtime
    } catch (error) {
      // If any error occurs, assume translation is needed
      this.logger.warn(`Error checking if file needs translation: ${error}`)
      return true
    }
  }

  private async shouldTranslateForCacheState(sourcePath: string): Promise<boolean> {
    if (typeof this.cache.hasSourcePath === 'function') {
      const hasSourcePath = await this.cache.hasSourcePath(sourcePath)
      if (!hasSourcePath) {
        return true
      }
    }

    if (typeof this.cache.hasPendingPurge === 'function') {
      const hasPendingPurge = await this.cache.hasPendingPurge()
      if (hasPendingPurge) {
        return true
      }
    }

    return false
  }

  getFileType(filePath: string): string {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.md') || lowerPath.endsWith('.mdx') || lowerPath.endsWith('.markdown')) {
      return 'md';
    }
    if (lowerPath.endsWith('.json')) {
      return 'json';
    }
    if (lowerPath.endsWith('.yml') || lowerPath.endsWith('.yaml')) {
      return 'yaml';
    }
    if (lowerPath.endsWith('.ts')) {
      return 'json'; // TS default-export files use JSON engine selection
    }

    throw new Error(`Unsupported file type for path: ${filePath}`);
  }

  /**
   * Process file for all target locales
   */
  public async processFile(
    srcUri: IUri,
    workspacePath: string,
    config: TranslateProjectConfig,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    forceTranslation: boolean = false
  ): Promise<void> {
    // Use values from config
    const sourceLocale = config.sourceLocale
    const targetLocales = config.targetLocales
    const enableBackTranslation = config.enableBackTranslation

    // Get relative path from the source folder
    const rel = getRelativePath(srcUri.fsPath, workspacePath, config)

    // Read and process file content
    const filename = srcUri.fsPath.replace(/\\/g, '/').toLowerCase()
    const content = await this.fileSystem.readFile(srcUri)

    // Check if this file is in the copy-only list
    const baseName = path.basename(srcUri.fsPath)
    const copyOnlyFiles = config.copyOnlyFiles ?? []
    if (copyOnlyFiles.includes(baseName)) {
      await this.copyFileToTargets(srcUri, workspacePath, config, forceTranslation)
      return
    }

    // Build exclusion options from config
    const excludeOptions = {
      excludeKeys: config.excludeKeys ?? [],
      excludeKeyPaths: config.excludeKeyPaths ?? []
    }

    const extraction = extractForFile(filename, content, excludeOptions)

    // Determine file type
    const fileType = this.getFileType(filename);
    // YAML files use the same translator as JSON

    // Get engine configuration
    const defaults = {
      md: config.defaultMarkdownEngine,
      json: config.defaultJsonEngine
    }

    // Create engine overrides mapping
    const overrides = this.createEngineOverrides(config.engineOverrides)

    // Load translation contexts for JSON files
    const contexts = await this.loadJsonContexts(extraction, srcUri)
    const passphrase = await this.resolvePassphrase()

    const sourcePath = findSourcePathForFile(srcUri.fsPath, workspacePath, config)
    if (!sourcePath) {
      throw new Error(`File ${srcUri.fsPath} is not in any of the configured source paths`)
    }

    const translateForCacheState = await this.shouldTranslateForCacheState(sourcePath)

    // Process each target locale
    for (const targetLocale of targetLocales) {
      // Create target URI
      const targetUri = createTargetUri(
        this.fileSystem,
        workspacePath,
        sourceLocale,
        targetLocale,
        rel,
        config,
        sourcePath
      )

      // Check if translation is needed based on file timestamps
      const translationNeeded =
        forceTranslation ||
        translateForCacheState ||
        await this.needsTranslation(srcUri, targetUri)

      if (!translationNeeded) {
        this.logger.info(`Skipping up-to-date file: ${path.basename(srcUri.fsPath)} [${sourceLocale} → ${targetLocale}]`)
        continue
      }

      // Forward translation (source to target)
      const engineName = pickEngine({
        source: sourceLocale,
        target: targetLocale,
        defaults,
        overrides,
        fileType
      })

      // Translate the segments using the executor
      const fwdResult = await this.executor.translateSegments(
        extraction.segments,
        contexts,
        engineName,
        sourceLocale,
        targetLocale,
        configProvider,
        srcUri.fsPath,
        false,
        passphrase
      )

      const fwd = fwdResult.translations

      // Log translation with statistics on same line
      const statsMsg = fwdResult.stats.total > 0
        ? ` - API: ${fwdResult.stats.apiCalls}, Cache: ${fwdResult.stats.cacheHits}, Total: ${fwdResult.stats.total}`
        : ''
      this.logger.info(`Translating: ${path.basename(srcUri.fsPath)} [${sourceLocale} → ${targetLocale}] (${engineName})${statsMsg}`)

      // Write forward translation output using the executor
      await this.executor.writeTranslation(targetUri, extraction.rebuild(fwd), srcUri.fsPath, false)
      // No additional logging after writing the file

      // Handle back translation if enabled
      if (enableBackTranslation) {
        // Get source path to determine if it's file-based or directory-based
        const sourcePath = findSourcePathForFile(srcUri.fsPath, workspacePath, config)

        // Create back-translation URI
        const backUri = createBackTranslationUri(
          this.fileSystem,
          workspacePath,
          targetLocale,
          rel,
          config,
          sourcePath || undefined
        )

        // Check if back-translation is needed
        const backTranslationNeeded = forceTranslation ||
                                     await this.needsTranslation(targetUri, backUri) ||
                                     translationNeeded; // If forward translation was updated, back translation is needed too

        if (!backTranslationNeeded) {
          this.logger.info(`Skipping up-to-date back-translation: ${path.basename(srcUri.fsPath)} [${targetLocale} → ${sourceLocale}]`)
          continue;
        }

        const backEngine = pickEngine({
          source: targetLocale,
          target: sourceLocale,
          defaults,
          overrides,
          fileType
        })

        // If using copy engine for forward translation, just copy the segments again
        let back: string[]
        let backStatsMsg = ''

        if (engineName === 'copy') {
          back = fwd.slice()
        } else {
          const backResult = await this.executor.translateSegments(
            fwd,
            contexts,
            backEngine,
            targetLocale,
            sourceLocale,
            configProvider,
            srcUri.fsPath,
            true,
            passphrase
          )
          back = backResult.translations

          // Prepare statistics message for back-translation
          if (backResult.stats.total > 0) {
            backStatsMsg = ` - API: ${backResult.stats.apiCalls}, Cache: ${backResult.stats.cacheHits}, Total: ${backResult.stats.total}`
          }
        }

        // Log back-translation with statistics on same line
        this.logger.info(`Back-translating: ${path.basename(srcUri.fsPath)} [${targetLocale} → ${sourceLocale}] (${backEngine})${backStatsMsg}`)

        // Write back translation output using the executor
        await this.executor.writeTranslation(backUri, extraction.rebuild(back), srcUri.fsPath, true)
        // No additional logging after writing the file
      }
    }
  }

  /**
   * Clean up empty directories after file deletion
   */
  public async pruneEmptyDirs(rootUri: IUri, relPath: string): Promise<void> {
    const parts = relPath.split('/')
    parts.pop() // Remove the file name

    while (parts.length) {
      const dir = this.fileSystem.joinPath(rootUri, ...parts)
      try {
        const entries = await this.fileSystem.readDirectory(dir)
        if (entries.length) break // Directory not empty, stop pruning
        await this.fileSystem.deleteFile(dir)
        parts.pop() // Move up to parent directory
      } catch {
        break // Stop if error occurs (likely directory doesn't exist)
      }
    }
  }

  /**
   * Remove translated files for a source file
   */
  public async removeFile(
    srcUri: IUri,
    workspacePath: string,
    config: TranslateProjectConfig,
    locales?: string[]
  ): Promise<void> {
    // Use provided locales or fall back to project config
    const targetLocales = locales || config.targetLocales

    // Get relative path from source
    const rel = getRelativePath(srcUri.fsPath, workspacePath, config)

    for (const locale of targetLocales) {
      // Get source path to determine if it's file-based or directory-based
      const sourcePath = findSourcePathForFile(srcUri.fsPath, workspacePath, config)

      // Get URIs for forward and back translation files
      const fwd = createTargetUri(
        this.fileSystem,
        workspacePath,
        config.sourceLocale,
        locale,
        rel,
        config,
        sourcePath || 'i18n/en' // fallback if sourcePath is null
      )

      const bwd = createBackTranslationUri(
        this.fileSystem,
        workspacePath,
        locale,
        rel,
        config,
        sourcePath || undefined
      )

      // Delete translation files
      try {
        await this.fileSystem.deleteFile(fwd)
        this.logger.info(`Deleted: ${path.basename(fwd.fsPath)} [${locale}]`)
      } catch (error) {
        // Ignore errors if file doesn't exist
        this.logger.debug(`Could not delete ${path.basename(fwd.fsPath)}: ${error}`)
      }

      try {
        await this.fileSystem.deleteFile(bwd)
        this.logger.info(`Deleted: ${path.basename(bwd.fsPath)} [${locale}_en]`)
      } catch (error) {
        // Ignore errors if file doesn't exist
        this.logger.debug(`Could not delete ${path.basename(bwd.fsPath)}: ${error}`)
      }

      // Clean up empty directories
      if (config.targetDir) {
        // If using custom target directory
        const targetBasePath = path.join(workspacePath, config.targetDir)
        await this.pruneEmptyDirs(
          this.fileSystem.createUri(path.join(targetBasePath, 'i18n', locale)),
          rel
        )
        await this.pruneEmptyDirs(
          this.fileSystem.createUri(path.join(targetBasePath, 'i18n', `${locale}_en`)),
          rel
        )
      } else {
        // Default cleanup paths
        await this.pruneEmptyDirs(
          this.fileSystem.joinPath(this.fileSystem.createUri(workspacePath), 'i18n', locale),
          rel
        )
        await this.pruneEmptyDirs(
          this.fileSystem.joinPath(this.fileSystem.createUri(workspacePath), 'i18n', `${locale}_en`),
          rel
        )
      }
    }
  }
}