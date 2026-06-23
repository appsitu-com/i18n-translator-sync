import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { TRANSLATOR_DIR } from '../constants'
import { FileSystem } from '../util/fs'
import { Logger, NO_OP_LOGGER } from '../util/baseLogger'
import { toWorkspaceRelativePosix } from '../util/pathShared'
import type { Pair, TranslationCache } from './TranslationCache'

const LOOKUP_SEPARATOR = '::'
const KEY_SEPARATOR = '\u0000'
const FILE_SCHEMA_VERSION = 1

type CacheEntry = {
  engine: string // Translation engine name, for example "google", "deepl", or "copy"
  source: string // Source locale code used for this translation, for example "en"
  target: string // Target locale code used for this translation, for example "fr"
  sourcePath: string // Workspace-relative source root path; a file path for file-based sources or a directory path for folder-based sources
  textPos: number // Zero-based segment position within the source file content
  sourceText: string // Original source segment text before translation
  context: string // Optional segment context string; usually empty, but may carry disambiguation metadata
  targetText: string // Translated text stored in the cache
  status: string // Translation status; defaults to "ai_draft"
  used: boolean // Whether this cache row has been used since the last purge cycle
  updatedAt: number // Unix timestamp in seconds when the row was last written
}

type JsonlLine = { type: 'meta'; schemaVersion: number } | ({ type: 'entry' } & CacheEntry)

export class JsonlTranslationCache implements TranslationCache {
  private readonly logger: Logger
  private readonly workspacePath: string
  private readonly cacheFilePath: string
  private readonly memoryOnly: boolean
  private readonly strictData = new Map<string, CacheEntry>()
  private readonly fallbackIndex = new Map<string, Set<string>>()
  private readonly sourcePaths = new Set<string>()
  private readonly isNewDatabaseFlag: boolean

  constructor(cacheFilePath: string, workspacePath: string, logger: Logger = NO_OP_LOGGER) {
    this.logger = logger
    this.workspacePath = workspacePath
    this.cacheFilePath = cacheFilePath
    this.memoryOnly = cacheFilePath === ':memory:'

    if (this.memoryOnly) {
      this.isNewDatabaseFlag = true
      return
    }

    const dir = path.dirname(cacheFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.isNewDatabaseFlag = !fs.existsSync(cacheFilePath)

    if (!this.isNewDatabaseFlag) {
      this.loadFromDisk()
    }
  }

  static async createFromWorkspace(
    workspacePath: string,
    fileSystem: FileSystem,
    logger?: Logger
  ): Promise<JsonlTranslationCache> {
    const cacheDir = path.join(workspacePath, TRANSLATOR_DIR)
    const cachePath = path.join(cacheDir, 'translation.jsonl')

    await fileSystem.createDirectory(fileSystem.createUri(cacheDir))

    return new JsonlTranslationCache(cachePath, workspacePath, logger)
  }

  async getMany({
    engine,
    source,
    target,
    texts,
    contexts,
    sourcePath = '',
    positions = []
  }: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: number[]
  }): Promise<Map<string, { translation: string; textPos?: number }>> {
    const out = new Map<string, { translation: string; textPos?: number }>()
    const normalizedSourcePath = this.normalizeSourcePath(sourcePath)
    let didMutate = false

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? ''
      const context = (contexts[i] ?? '').toString()
      const textPos = positions[i] ?? 0

      const strictKey = this.makeStrictKey(engine, source, target, normalizedSourcePath, textPos, text, context)
      const strictEntry = this.strictData.get(strictKey)
      const entry = strictEntry ?? this.getFallbackEntry(engine, source, target, text, context)

      if (!entry) {
        continue
      }

      if (!entry.used) {
        entry.used = true
        didMutate = true
      }

      out.set(`${text}${LOOKUP_SEPARATOR}${context}`, {
        translation: entry.targetText,
        textPos: entry.textPos
      })
    }

    if (didMutate) {
      this.persistToDisk()
    }

    return out
  }

  async putMany({
    engine,
    source,
    target,
    pairs,
    sourcePath = ''
  }: {
    engine: string
    source: string
    target: string
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
      const strictKey = this.makeStrictKey(engine, source, target, normalizedSourcePath, textPos, pair.src, context)
      const fallbackKey = this.makeFallbackKey(engine, source, target, pair.src, context)

      const next: CacheEntry = {
        engine,
        source,
        target,
        sourcePath: normalizedSourcePath,
        textPos,
        sourceText: pair.src,
        context,
        targetText: pair.dst,
        status: 'ai_draft',
        used: true,
        updatedAt: now
      }

      this.strictData.set(strictKey, next)
      this.addFallbackIndex(fallbackKey, strictKey)
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
          return a.textPos - b.textPos
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
        if (context.column === 'text_pos' || context.column === 'updated_at') {
          return Number(value)
        }
        return value
      }
    }) as Array<{
      source_path: string
      text_pos: number
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

    for (const record of records) {
      const normalizedSourcePath = this.normalizeSourcePath(record.source_path ?? '')
      const textPos = record.text_pos ?? 0
      const context = (record.context ?? '').toString()
      const updatedAt = record.updated_at || this.nowSeconds()

      if (normalizedSourcePath) {
        this.sourcePaths.add(normalizedSourcePath)
      }

      const entry: CacheEntry = {
        engine: record.engine_name,
        source: record.source_lang,
        target: record.target_lang,
        sourcePath: normalizedSourcePath,
        textPos,
        sourceText: record.source_text,
        context,
        targetText: record.target_text,
        status: record.status || 'ai_draft',
        used: true,
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
    this.logger.info(`Imported ${records.length} translations from ${filePath}`)
    return records.length
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
    for (const entry of this.strictData.values()) {
      if (!entry.used) {
        return true
      }
    }
    return false
  }

  async purge(): Promise<{ deletedCount: number }> {
    for (const entry of this.strictData.values()) {
      entry.used = false
    }

    this.persistToDisk()
    this.logger.info('Marked all translations as unused. Retranslate files to mark used translations.')
    return { deletedCount: 0 }
  }

  async completePurge(): Promise<{ deletedCount: number }> {
    let deletedCount = 0

    for (const [key, entry] of this.strictData.entries()) {
      if (!entry.used) {
        this.strictData.delete(key)
        deletedCount++
      }
    }

    this.rebuildIndexes()
    this.persistToDisk()
    this.logger.info(`Purged ${deletedCount} unused translations`)
    return { deletedCount }
  }

  isNew(): boolean {
    return this.isNewDatabaseFlag
  }

  close(): void {
    this.logger.debug('Closing JSONL cache')
    this.persistToDisk()
  }

  private loadFromDisk(): void {
    try {
      const raw = fs.readFileSync(this.cacheFilePath, 'utf8')
      if (!raw.trim()) {
        return
      }

      const lines = raw.split(/\r?\n/)

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        let parsed: JsonlLine
        try {
          parsed = JSON.parse(trimmed) as JsonlLine
        } catch {
          this.logger.warn(`Ignoring invalid JSONL cache line in ${this.cacheFilePath}`)
          continue
        }

        if (parsed.type === 'meta') {
          continue
        }

        if (parsed.type !== 'entry') {
          continue
        }

        const strictKey = this.makeStrictKey(
          parsed.engine,
          parsed.source,
          parsed.target,
          parsed.sourcePath,
          parsed.textPos,
          parsed.sourceText,
          parsed.context
        )

        const fallbackKey = this.makeFallbackKey(
          parsed.engine,
          parsed.source,
          parsed.target,
          parsed.sourceText,
          parsed.context
        )

        const entry: CacheEntry = {
          engine: parsed.engine,
          source: parsed.source,
          target: parsed.target,
          sourcePath: parsed.sourcePath,
          textPos: parsed.textPos,
          sourceText: parsed.sourceText,
          context: parsed.context,
          targetText: parsed.targetText,
          status: typeof parsed.status === 'string' && parsed.status.trim().length > 0 ? parsed.status : 'ai_draft',
          used: Boolean(parsed.used),
          updatedAt: parsed.updatedAt
        }

        this.strictData.set(strictKey, entry)

        if (entry.sourcePath) {
          this.sourcePaths.add(entry.sourcePath)
        }

        this.addFallbackIndex(fallbackKey, strictKey)
      }
    } catch (error) {
      this.logger.warn(`Failed to load JSONL cache ${this.cacheFilePath}: ${String(error)}`)
      this.strictData.clear()
      this.fallbackIndex.clear()
      this.sourcePaths.clear()
    }
  }

  private persistToDisk(): void {
    if (this.memoryOnly) {
      return
    }

    const lines: string[] = [JSON.stringify({ type: 'meta', schemaVersion: FILE_SCHEMA_VERSION } satisfies JsonlLine)]

    for (const entry of this.strictData.values()) {
      lines.push(JSON.stringify({ type: 'entry', ...entry } satisfies JsonlLine))
    }

    const dir = path.dirname(this.cacheFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tempFile = `${this.cacheFilePath}.tmp`
    fs.writeFileSync(tempFile, `${lines.join('\n')}\n`, 'utf8')
    fs.renameSync(tempFile, this.cacheFilePath)
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
    source: string,
    target: string,
    sourceText: string,
    context: string
  ): CacheEntry | undefined {
    const fallbackKey = this.makeFallbackKey(engine, source, target, sourceText, context)
    const strictKeys = this.fallbackIndex.get(fallbackKey)

    if (!strictKeys || strictKeys.size === 0) {
      return undefined
    }

    let latest: CacheEntry | undefined

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
    textPos: number,
    sourceText: string,
    context: string
  ): string {
    return [engine, source, target, sourcePath, String(textPos), sourceText, context].join(KEY_SEPARATOR)
  }

  private makeFallbackKey(engine: string, source: string, target: string, sourceText: string, context: string): string {
    return [engine, source, target, sourceText, context].join(KEY_SEPARATOR)
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }
}
