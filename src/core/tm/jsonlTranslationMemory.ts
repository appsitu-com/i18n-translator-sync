import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { TRANSLATOR_DIR } from '../constants'
import { FileSystem } from '../util/fs'
import { Logger, NO_OP_LOGGER } from '../util/baseLogger'
import { toWorkspaceRelativePosix } from '../util/pathShared'
import type { Pair, TranslationMemory } from './TranslationMemory'
import type { TmEntry, JsonlTmLine } from './jsonlTmTypes'
import { JsonlTmMigrator } from './migrations/jsonlTmMigrator'
import { V1ToV2JsonlTmMigration } from './migrations/v1ToV2JsonlTmMigration'

const LOOKUP_SEPARATOR = '::'
const KEY_SEPARATOR = '\u0000'
const FILE_SCHEMA_VERSION = 2

export class JsonlTranslationMemory implements TranslationMemory {
  private readonly logger: Logger
  private readonly workspacePath: string
  private readonly tmFilePath: string
  private readonly memoryOnly: boolean
  // Maps strict keys (engine+source+target+sourcePath+textPos+sourceText+context) to cache entries
  private readonly strictData = new Map<string, TmEntry>()
  // Maps fallback keys (engine+source+target+sourceText+context) to sets of strict keys
  private readonly fallbackIndex = new Map<string, Set<string>>()

  private readonly sourcePaths = new Set<string>()
  private readonly usedStrictKeysDuringPurge = new Set<string>()
  private purgeInProgress = false
  private readonly isNewDatabaseFlag: boolean
  private readonly tmMigrator = new JsonlTmMigrator([new V1ToV2JsonlTmMigration()])
  private migrationOccurred = false

  constructor(tmFilePath: string, workspacePath: string, logger: Logger = NO_OP_LOGGER) {
    this.logger = logger
    this.workspacePath = workspacePath
    this.tmFilePath = tmFilePath
    this.memoryOnly = tmFilePath === ':memory:'

    if (this.memoryOnly) {
      this.isNewDatabaseFlag = true
      return
    }

    const dir = path.dirname(tmFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.isNewDatabaseFlag = !fs.existsSync(tmFilePath)

    if (!this.isNewDatabaseFlag) {
      this.loadFromDisk()
    }
  }

  static async createFromWorkspace(
    workspacePath: string,
    fileSystem: FileSystem,
    logger?: Logger
  ): Promise<JsonlTranslationMemory> {
    const cacheDir = path.join(workspacePath, TRANSLATOR_DIR)
    const cachePath = path.join(cacheDir, 'translation.jsonl')

    await fileSystem.createDirectory(fileSystem.createUri(cacheDir))

    return new JsonlTranslationMemory(cachePath, workspacePath, logger)
  }

  async getMany({
    engine,
    sourceLocale,
    targetLocale,
    texts,
    contexts,
    sourcePath = '',
    positions = []
  }: {
    engine: string
    sourceLocale: string
    targetLocale: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: (number | string)[]
  }): Promise<Map<string, { translation: string; textPos?: number | string }>> {
    const out = new Map<string, { translation: string; textPos?: number | string }>()
    const normalizedSourcePath = this.normalizeSourcePath(sourcePath)
    const debugCacheLookup = this.shouldDebugCacheLookup()
    let strictHits = 0
    let fallbackPromotions = 0
    let misses = 0
    const missSamples: string[] = []

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? ''
      const context = (contexts[i] ?? '').toString()
      const textPos = positions[i] ?? 0

      const strictKey = this.makeStrictKey(engine, sourceLocale, targetLocale, normalizedSourcePath, textPos, text, context)
      const strictEntry = this.strictData.get(strictKey)
      if (strictEntry) {
        strictHits++
        this.markStrictKeyUsed(strictKey)

        out.set(`${text}${LOOKUP_SEPARATOR}${context}`, {
          translation: strictEntry.targetText,
          textPos: strictEntry.textPos
        })
        continue
      }

      const fallbackEntry = this.getFallbackEntry(
        engine,
        sourceLocale,
        targetLocale,
        text,
        context
      )
      if (!fallbackEntry) {
        misses++
        if (debugCacheLookup && missSamples.length < 5) {
          missSamples.push(`text=${JSON.stringify(text)} ctx=${JSON.stringify(context)} pos=${JSON.stringify(textPos)}`)
        }
        continue
      }

      const promotedEntry = this.promoteFallbackEntry({
        strictKey,
        engine,
        sourceLocale,
        targetLocale,
        sourcePath: normalizedSourcePath,
        textPos,
        sourceText: text,
        context,
        fallbackEntry
      })
      fallbackPromotions++

      out.set(`${text}${LOOKUP_SEPARATOR}${context}`, {
        translation: promotedEntry.targetText,
        textPos: promotedEntry.textPos
      })
    }

    // Intentionally skip immediate persistence for lookup-time mutations
    // and fallback promotions. This keeps purge re-translation fast and still persists via
    // existing write points (putMany, purge, completePurge, close).

    if (debugCacheLookup) {
      this.logger.debug(
        `[cache.lookup] engine=${engine} ${sourceLocale}->${targetLocale} sourcePath=${normalizedSourcePath || '<none>'} total=${texts.length} strictHits=${strictHits} fallbackPromotions=${fallbackPromotions} misses=${misses}`
      )
      if (missSamples.length > 0) {
        this.logger.debug(`[cache.lookup.miss-samples] ${missSamples.join(' | ')}`)
      }
    }

    return out
  }

  async putMany({
    engine,
    sourceLocale,
    targetLocale,
    pairs,
    sourcePath = ''
  }: {
    engine: string
    sourceLocale: string
    targetLocale: string
    pairs: Pair[]
    sourcePath?: string
  }): Promise<void> {
    const normalizedSourcePath = this.normalizeSourcePath(sourcePath)

    if (normalizedSourcePath) {
      this.sourcePaths.add(normalizedSourcePath)
    }

    const now = this.nowSeconds()

    for (const pair of pairs) {
      const textPos = pair.pos ?? 0
      const context = (pair.ctx ?? '').toString()
      const strictKey = this.makeStrictKey(engine, sourceLocale, targetLocale, normalizedSourcePath, textPos, pair.src, context)
      const fallbackKey = this.makeFallbackKey(engine, sourceLocale, targetLocale, pair.src, context)

      const next: TmEntry = {
        engine,
        source: sourceLocale,
        target: targetLocale,
        sourcePath: normalizedSourcePath,
        textPos,
        sourceText: pair.src,
        context,
        targetText: pair.dst,
        status: 'ai_draft',
        updatedAt: now
      }

      this.strictData.set(strictKey, next)
      this.addFallbackIndex(fallbackKey, strictKey)
      this.markStrictKeyUsed(strictKey)
    }

    this.persistToDisk()
  }

  async exportCSV(filePath: string): Promise<void> {
    const rows = Array.from(this.strictData.values())
      .sort((a, b) => {
        if (a.sourcePath !== b.sourcePath) {
          return a.sourcePath.localeCompare(b.sourcePath)
        }
        if (a.textPos !== b.textPos) {
          return this.compareTextPos(a.textPos, b.textPos)
        }
        return a.target.localeCompare(b.target)
      })
      .map((entry) => ({
        source_path: entry.sourcePath,
        text_pos: entry.textPos,
        engine_name: entry.engine,
        source_lang: entry.source,
        target_lang: entry.target,
        source_text: entry.sourceText,
        context: entry.context,
        target_text: entry.targetText,
        status: entry.status,
        updated_at: entry.updatedAt
      }))

    const csvContent = stringify(rows, {
      header: true,
      columns: [
        'source_path',
        'text_pos',
        'engine_name',
        'source_lang',
        'target_lang',
        'source_text',
        'context',
        'target_text',
        'status',
        'updated_at'
      ]
    })

    fs.writeFileSync(filePath, csvContent, 'utf8')
    this.logger.info(`Exported ${rows.length} translations to ${filePath}`)
  }

  async importCSV(filePath: string): Promise<number> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`CSV file not found: ${filePath}`)
      return 0
    }

    const text = fs.readFileSync(filePath, 'utf8')

    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      cast: (value, context) => {
        if (context.column === 'updated_at') {
          return Number(value)
        }
        if (context.column === 'text_pos') {
          const trimmed = String(value)
          const numericValue = Number(trimmed)
          if (trimmed !== '' && Number.isFinite(numericValue) && String(numericValue) === trimmed) {
            return numericValue
          }
        }
        return value
      }
    }) as Array<{
      source_path: string
      text_pos: number | string
      engine_name: string
      source_lang: string
      target_lang: string
      source_text: string
      context?: string
      target_text: string
      status?: string
      updated_at?: number
    }>

    this.strictData.clear()
    this.fallbackIndex.clear()
    this.sourcePaths.clear()
    let skippedLegacyNumericStructuredRows = 0

    for (const record of records) {
      const normalizedSourcePath = this.normalizeSourcePath(record.source_path ?? '')
      const textPos = record.text_pos ?? 0
      const context = (record.context ?? '').toString()
      const updatedAt = record.updated_at || this.nowSeconds()

      if (typeof textPos === 'number' && this.isStructuredSourceFile(normalizedSourcePath)) {
        skippedLegacyNumericStructuredRows++
        continue
      }

      if (normalizedSourcePath) {
        this.sourcePaths.add(normalizedSourcePath)
      }

      const entry: TmEntry = {
        engine: record.engine_name,
        source: record.source_lang,
        target: record.target_lang,
        sourcePath: normalizedSourcePath,
        textPos,
        sourceText: record.source_text,
        context,
        targetText: record.target_text,
        status: record.status || 'ai_draft',
        updatedAt
      }

      const strictKey = this.makeStrictKey(
        entry.engine,
        entry.source,
        entry.target,
        entry.sourcePath,
        entry.textPos,
        entry.sourceText,
        entry.context
      )
      const fallbackKey = this.makeFallbackKey(
        entry.engine,
        entry.source,
        entry.target,
        entry.sourceText,
        entry.context
      )

      this.strictData.set(strictKey, entry)
      this.addFallbackIndex(fallbackKey, strictKey)
    }

    this.persistToDisk()
    const importedCount = records.length - skippedLegacyNumericStructuredRows
    this.logger.info(`Imported ${importedCount} translations from ${filePath}`)
    if (skippedLegacyNumericStructuredRows > 0) {
      this.logger.warn(
        `Skipped ${skippedLegacyNumericStructuredRows} legacy numeric structured translation row(s) during CSV import`
      )
    }
    return importedCount
  }

  async hasSourcePath(sourcePath: string): Promise<boolean> {
    const normalizedSourcePath = this.normalizeSourcePath(sourcePath)

    if (this.sourcePaths.has(normalizedSourcePath)) {
      return true
    }

    const directoryPrefix = normalizedSourcePath.endsWith('/') ? normalizedSourcePath : `${normalizedSourcePath}/`

    for (const knownSourcePath of this.sourcePaths) {
      if (knownSourcePath.startsWith(directoryPrefix)) {
        return true
      }
    }

    return false
  }

  async hasPendingPurge(): Promise<boolean> {
    return this.purgeInProgress
  }

  async purge(): Promise<{ deletedCount: number }> {
    this.purgeInProgress = true
    this.usedStrictKeysDuringPurge.clear()
    this.logger.info('Marked all translations as unused. Retranslate files to mark used translations.')
    return { deletedCount: 0 }
  }

  async completePurge(): Promise<{ deletedCount: number }> {
    if (!this.purgeInProgress) {
      return { deletedCount: 0 }
    }

    let deletedCount = 0

    for (const [key, entry] of this.strictData.entries()) {
      if (!this.usedStrictKeysDuringPurge.has(key)) {
        this.strictData.delete(key)
        deletedCount++
      }
    }

    this.purgeInProgress = false
    this.usedStrictKeysDuringPurge.clear()
    this.rebuildIndexes()
    this.persistToDisk()
    this.logger.info(`Purged ${deletedCount} unused translations`)
    return { deletedCount }
  }

  isNew(): boolean {
    return this.isNewDatabaseFlag
  }

  didMigrateFromV1(): boolean {
    return this.migrationOccurred
  }

  clearMigrationFlag(): void {
    this.migrationOccurred = false
  }

  close(): void {
    this.logger.debug('Closing JSONL cache')
    this.persistToDisk()
  }

  private loadFromDisk(): void {
    try {
      const raw = fs.readFileSync(this.tmFilePath, 'utf8')
      if (!raw.trim()) {
        return
      }

      const lines = raw.split(/\r?\n/)
      const entries: TmEntry[] = []
      let schemaVersion = 1

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        let parsed: JsonlTmLine
        try {
          parsed = JSON.parse(trimmed) as JsonlTmLine
        } catch {
          this.logger.warn(`Ignoring invalid JSONL cache line in ${this.tmFilePath}`)
          continue
        }

        if (parsed.type === 'meta') {
          schemaVersion = parsed.schemaVersion
          continue
        }

        if (parsed.type !== 'entry') {
          continue
        }

        entries.push({
          engine: parsed.engine,
          source: parsed.source,
          target: parsed.target,
          sourcePath: parsed.sourcePath,
          textPos: parsed.textPos,
          sourceText: parsed.sourceText,
          context: parsed.context,
          targetText: parsed.targetText,
          status: typeof parsed.status === 'string' && parsed.status.trim().length > 0 ? parsed.status : 'ai_draft',
          updatedAt: parsed.updatedAt
        })
      }

      const migrationResult = this.tmMigrator.run({
        entries,
        schemaVersion,
        targetVersion: FILE_SCHEMA_VERSION,
        context: {
          workspacePath: this.workspacePath,
          logger: this.logger
        }
      })

      const migratedEntries = migrationResult.entries

      for (const entry of migratedEntries) {
        const strictKey = this.makeStrictKey(
          entry.engine,
          entry.source,
          entry.target,
          entry.sourcePath,
          entry.textPos,
          entry.sourceText,
          entry.context
        )

        const fallbackKey = this.makeFallbackKey(
          entry.engine,
          entry.source,
          entry.target,
          entry.sourceText,
          entry.context
        )

        this.strictData.set(strictKey, entry)

        if (entry.sourcePath) {
          this.sourcePaths.add(entry.sourcePath)
        }

        this.addFallbackIndex(fallbackKey, strictKey)
      }

      if (migrationResult.didMigrate) {
        this.migrationOccurred = true
        this.persistToDisk()
      }
    } catch (error) {
      this.logger.warn(`Failed to load JSONL cache ${this.tmFilePath}: ${String(error)}`)
      this.strictData.clear()
      this.fallbackIndex.clear()
      this.sourcePaths.clear()
    }
  }

  private persistToDisk(): void {
    if (this.memoryOnly) {
      return
    }

    const lines: string[] = [JSON.stringify({ type: 'meta', schemaVersion: FILE_SCHEMA_VERSION } satisfies JsonlTmLine)]

    for (const entry of this.strictData.values()) {
      lines.push(JSON.stringify({ type: 'entry', ...entry } satisfies JsonlTmLine))
    }

    const dir = path.dirname(this.tmFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const serialized = `${lines.join('\n')}\n`
    const tempFile = `${this.tmFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`

    fs.writeFileSync(tempFile, serialized, 'utf8')

    try {
      fs.renameSync(tempFile, this.tmFilePath)
    } catch (error) {
      if (this.isTransientRenameError(error)) {
        this.logger.warn(
          `Atomic cache rename failed for ${this.tmFilePath}; attempting non-atomic copy fallback (${String(error)})`
        )

        try {
          fs.copyFileSync(tempFile, this.tmFilePath)
          this.logger.info(
            `Cache persisted via non-atomic copy fallback for ${this.tmFilePath} (no data loss expected)`
          )
        } catch (copyError) {
          this.logger.error(
            `Failed to persist JSONL cache ${this.tmFilePath} after rename and copy fallback: ${String(copyError)}`
          )
        }
      } else {
        throw error
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Best-effort cleanup; stale temp files are harmless.
        }
      }
    }
  }

  private isTransientRenameError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    return code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY'
  }

  private rebuildIndexes(): void {
    this.fallbackIndex.clear()
    this.sourcePaths.clear()

    for (const [strictKey, entry] of this.strictData.entries()) {
      const fallbackKey = this.makeFallbackKey(
        entry.engine,
        entry.source,
        entry.target,
        entry.sourceText,
        entry.context
      )
      this.addFallbackIndex(fallbackKey, strictKey)

      if (entry.sourcePath) {
        this.sourcePaths.add(entry.sourcePath)
      }
    }
  }

  private getFallbackEntry(
    engine: string,
    sourceLocale: string,
    targetLocale: string,
    sourceText: string,
    context: string
  ): TmEntry | undefined {
    const fallbackKey = this.makeFallbackKey(engine, sourceLocale, targetLocale, sourceText, context)
    const strictKeys = this.fallbackIndex.get(fallbackKey)

    if (!strictKeys || strictKeys.size === 0) {
      return undefined
    }

    let latest: TmEntry | undefined

    for (const strictKey of strictKeys) {
      const candidate = this.strictData.get(strictKey)
      if (!candidate) {
        continue
      }

      if (!latest) {
        latest = candidate
        continue
      }

      if (candidate.updatedAt > latest.updatedAt) {
        latest = candidate
      }
    }

    return latest
  }

  private promoteFallbackEntry({
    strictKey,
    engine,
    sourceLocale,
    targetLocale,
    sourcePath,
    textPos,
    sourceText,
    context,
    fallbackEntry
  }: {
    strictKey: string
    engine: string
    sourceLocale: string
    targetLocale: string
    sourcePath: string
    textPos: number | string
    sourceText: string
    context: string
    fallbackEntry: TmEntry
  }): TmEntry {
    const fallbackKey = this.makeFallbackKey(engine, sourceLocale, targetLocale, sourceText, context)
    const now = this.nowSeconds()

    const promotedEntry: TmEntry = {
      engine,
      source: sourceLocale,
      target: targetLocale,
      sourcePath,
      textPos,
      sourceText,
      context,
      targetText: fallbackEntry.targetText,
      status: fallbackEntry.status,
      updatedAt: now
    }

    if (sourcePath) {
      this.sourcePaths.add(sourcePath)
    }

    this.strictData.set(strictKey, promotedEntry)
    this.addFallbackIndex(fallbackKey, strictKey)
    this.markStrictKeyUsed(strictKey)

    return promotedEntry
  }

  private markStrictKeyUsed(strictKey: string): void {
    if (!this.purgeInProgress) {
      return
    }

    this.usedStrictKeysDuringPurge.add(strictKey)
  }

  private addFallbackIndex(fallbackKey: string, strictKey: string): void {
    const keys = this.fallbackIndex.get(fallbackKey)
    if (keys) {
      keys.add(strictKey)
      return
    }

    this.fallbackIndex.set(fallbackKey, new Set([strictKey]))
  }

  private normalizeSourcePath(sourcePath: string): string {
    if (!sourcePath) {
      return ''
    }

    return toWorkspaceRelativePosix(sourcePath, this.workspacePath)
  }

  private makeStrictKey(
    engine: string,
    source: string,
    target: string,
    sourcePath: string,
    textPos: number | string,
    sourceText: string,
    context: string
  ): string {
    return [
      engine,
      source,
      target,
      sourcePath,
      String(textPos),
      this.normalizeKeyText(sourceText),
      context
    ].join(KEY_SEPARATOR)
  }

  private makeFallbackKey(engine: string, source: string, target: string, sourceText: string, context: string): string {
    return [engine, source, target, this.normalizeKeyText(sourceText), context].join(KEY_SEPARATOR)
  }

  private normalizeKeyText(text: string): string {
    return text.trim()
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  private shouldDebugCacheLookup(): boolean {
    const flag = process.env.TRANSLATOR_DEBUG_CACHE_LOOKUP?.toLowerCase()
    return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
  }

  private compareTextPos(left: number | string, right: number | string): number {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }

    return String(left).localeCompare(String(right))
  }

  private isStructuredSourceFile(sourcePath: string): boolean {
    const lowerPath = sourcePath.toLowerCase()
    return (
      lowerPath.endsWith('.json') ||
      lowerPath.endsWith('.yaml') ||
      lowerPath.endsWith('.yml') ||
      lowerPath.endsWith('.ts') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.mjs') ||
      lowerPath.endsWith('.cjs')
    )
  }

}
