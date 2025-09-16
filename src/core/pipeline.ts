import * as path from 'path'
import { FileSystem, IUri } from './util/fs'
import { Logger } from './util/logger'
import { TranslationCache } from './cache/sqlite'
import { extractForFile, jsonPathToString } from '../extractors/index'
import { loadContextCsvForJson } from './contextCsv'
import { bulkTranslateWithEngine } from '../bulkTranslate'
import { pickEngine } from '../translators/registry'
import { resolveEnvDeep } from './util/env'
import { TranslatorApiConfig, TranslatorEngine } from '../translators/types'
import { TranslateProjectConfig } from './config'
import {
  getRelativePath,
  createTargetUri,
  createBackTranslationUri,
  normalizePath
} from './util/paths'

/**
 * Core translator pipeline service
 */
export class TranslatorPipeline {
  private fileSystem: FileSystem
  private logger: Logger
  private cache: TranslationCache

  constructor(fileSystem: FileSystem, logger: Logger, cache: TranslationCache) {
    this.fileSystem = fileSystem
    this.logger = logger
    this.cache = cache
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
   * Write text content to a file, ensuring its directory exists
   */
  private async writeText(uri: IUri, text: string): Promise<void> {
    await this.ensureDirFor(uri)
    try {
      await this.fileSystem.writeFile(uri, text)
    } catch (error) {
      this.logger.error(`Failed to write file ${uri.fsPath}: ${error}`)
      throw error
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

      // Find any issues with the context data
      const unknown = Object.keys(ctxMap).filter((k) => !validPaths.has(k))
      const msgs = []

      if (unknown.length) {
        msgs.push(`Unknown context path(s): ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? ' …' : ''}`)
      }

      if (stats.duplicates.length) {
        msgs.push(`Duplicate path(s): ${stats.duplicates.slice(0, 6).join(', ')}${stats.duplicates.length > 6 ? ' …' : ''}`)
      }

      if (stats.emptyValues.length) {
        msgs.push(
          `Empty context value(s): ${stats.emptyValues.slice(0, 6).join(', ')}${stats.emptyValues.length > 6 ? ' …' : ''}`
        )
      }

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

  /**
   * Translate segments using specified engine
   */
  private async translateSegments(
    segments: string[],
    contexts: (string | null)[],
    engineName: TranslatorEngine,
    sourceLocale: string,
    targetLocale: string,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T }
  ): Promise<string[]> {
    // If using copy engine, just return original segments
    if (engineName === 'copy') {
      return segments.slice()
    }

    // Get engine configuration and translate
    const apiConfig = this.getEngineConfig(engineName, configProvider)
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

  /**
   * Process file for all target locales
   */
  public async processFile(
    srcUri: IUri,
    workspacePath: string,
    config: TranslateProjectConfig,
    configProvider: { get: <T>(section: string, defaultValue?: T) => T },
    params?: Partial<{ sourceLocale: string; targetLocales: string[]; enableBackTranslation: boolean }>,
    forceTranslation: boolean = false
  ): Promise<void> {
    // Use provided params or fall back to project config
    const sourceLocale = params?.sourceLocale ?? config.sourceLocale
    const targetLocales = params?.targetLocales ?? config.targetLocales
    const enableBackTranslation = params?.enableBackTranslation ?? config.enableBackTranslation

    // Get relative path from the source folder
    const rel = getRelativePath(srcUri.fsPath, workspacePath, config)
    this.logger.info(`File ${srcUri.fsPath} resolved to relative path: ${rel}`)

    // Read and process file content
    const filename = srcUri.fsPath.replace(/\\/g, '/').toLowerCase()
    const content = await this.fileSystem.readFile(srcUri)
    const extraction = extractForFile(filename, content)

    // Determine file type
    const isMarkdown = filename.endsWith('.md') || filename.endsWith('.mdx') || filename.endsWith('.markdown')
    const isYaml = filename.endsWith('.yml') || filename.endsWith('.yaml')
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

    // Process each target locale
    for (const targetLocale of targetLocales) {
      // Create target URI
      const targetUri = createTargetUri(
        this.fileSystem,
        workspacePath,
        sourceLocale,
        targetLocale,
        rel,
        config
      )

      // Check if translation is needed based on file timestamps
      const translationNeeded = forceTranslation || await this.needsTranslation(srcUri, targetUri)

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
        isMarkdown
      })

      // Simple, concise logging with just one line per file translation
      this.logger.info(`Translating: ${path.basename(srcUri.fsPath)} [${sourceLocale} → ${targetLocale}] (${engineName})`)

      // Translate the segments
      const fwd = await this.translateSegments(
        extraction.segments,
        contexts,
        engineName,
        sourceLocale,
        targetLocale,
        configProvider
      )

      // Write forward translation output
      await this.writeText(targetUri, extraction.rebuild(fwd))
      // No additional logging after writing the file

      // Handle back translation if enabled
      if (enableBackTranslation) {
        // Create back-translation URI
        const backUri = createBackTranslationUri(
          this.fileSystem,
          workspacePath,
          targetLocale,
          rel,
          config
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
          isMarkdown
        })

        // Simple, concise logging with just one line for back-translation
        this.logger.info(`Back-translating: ${path.basename(srcUri.fsPath)} [${targetLocale} → ${sourceLocale}] (${backEngine})`)

        // If using copy engine for forward translation, just copy the segments again
        const back =
          engineName === 'copy'
            ? fwd.slice()
            : await this.translateSegments(
                fwd,
                contexts,
                backEngine,
                targetLocale,
                sourceLocale,
                configProvider
              )

        // Write back translation output
        await this.writeText(backUri, extraction.rebuild(back))
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
      // Get URIs for forward and back translation files
      const fwd = createTargetUri(
        this.fileSystem,
        workspacePath,
        config.sourceLocale,
        locale,
        rel,
        config
      )

      const bwd = createBackTranslationUri(
        this.fileSystem,
        workspacePath,
        locale,
        rel,
        config
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