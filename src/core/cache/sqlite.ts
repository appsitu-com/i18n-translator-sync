import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { TRANSLATOR_DIR } from '../constants'
import { FileSystem } from '../util/fs'
import { Logger, NO_OP_LOGGER } from '../util/baseLogger'
import { toWorkspaceRelativePosix } from '../util/pathShared'

const LATEST_SCHEMA_VERSION = 2

export type Pair = { src: string; dst: string; ctx?: string | null; pos?: number }

export interface TranslationCache {
  /**
   * Get multiple translations from the cache
   */
  getMany(params: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: number[]
  }): Promise<Map<string, { translation: string; textPos?: number }>>

  /**
   * Put multiple translations into the cache
   */
  putMany(params: {
    engine: string
    source: string
    target: string
    pairs: Pair[]
    sourcePath?: string
  }): Promise<void>

  /**
   * Export the cache to a CSV file
   */
  exportCSV(filePath: string): Promise<void>

  /**
   * Import translations from a CSV file
   */
  importCSV(filePath: string): Promise<number>

  /**
   * Check whether a source file path exists in the cache index
   */
  hasSourcePath?(sourcePath: string): Promise<boolean>

  /**
   * Check whether purge mark phase is active (unused rows pending sweep)
   */
  hasPendingPurge?(): Promise<boolean>

  /**
   * Check if this cache database was just created
   */
  isNew?(): boolean

  /**
   * Close the cache connection
   */
  close(): void
}

/**
 * Node SQLite cache implementation for CLI usage
 */
export class NodeSQLiteCache implements TranslationCache {
  private cache: SQLiteCache

  constructor(logger: Logger, dbPath: string, workspacePath?: string) {
    const resolvedWorkspacePath = workspacePath ?? process.cwd()
    this.cache = new SQLiteCache(dbPath, resolvedWorkspacePath, logger)
  }

  async initialize(): Promise<void> {
    // No initialization needed, constructor does this
  }

  async getMany(params: {
    engine: string;
    source: string;
    target: string;
    texts: string[];
    contexts: (string | null | undefined)[];
    sourcePath?: string;
    positions?: number[];
  }): Promise<Map<string, { translation: string; textPos?: number }>> {
    return this.cache.getMany(params)
  }

  async putMany(params: {
    engine: string;
    source: string;
    target: string;
    pairs: Pair[];
    sourcePath?: string;
  }): Promise<void> {
    return this.cache.putMany(params)
  }

  async exportCSV(filePath: string): Promise<void> {
    return this.cache.exportCSV(filePath)
  }

  async importCSV(filePath: string): Promise<number> {
    return this.cache.importCSV(filePath)
  }

  async hasSourcePath(sourcePath: string): Promise<boolean> {
    return this.cache.hasSourcePath(sourcePath)
  }

  async hasPendingPurge(): Promise<boolean> {
    return this.cache.hasPendingPurge()
  }

  async purge(): Promise<{ deletedCount: number }> {
    return this.cache.purge()
  }

  async completePurge(): Promise<{ deletedCount: number }> {
    return this.cache.completePurge()
  }

  close(): void {
    this.cache.close()
  }

  isNew(): boolean {
    return this.cache.isNew()
  }
}

export class SQLiteCache implements TranslationCache {
  private db: Database.Database
  private logger: Logger
  private workspacePath: string
  private isNewDatabase: boolean
  private getSourceFileIdStmt: Database.Statement
  private insertSourceFileStmt: Database.Statement
  private selectTranslationStmt: Database.Statement
  private selectTranslationFallbackStmt: Database.Statement
  private insertTranslationStmt: Database.Statement
  private updateTextPosStmt: Database.Statement
  private updateUsedStmt: Database.Statement

  /**
   * Create a new SQLite cache
   */
  constructor(dbFile: string, workspacePath: string, logger: Logger = NO_OP_LOGGER) {
    this.logger = logger
    this.workspacePath = workspacePath

    const dir = path.dirname(dbFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // Check if database file exists before creating it
    const dbExists = fs.existsSync(dbFile)

    this.logger.debug(`Opening SQLite cache at ${dbFile}`)

    this.db = Database(dbFile)
    this.db.pragma('journal_mode = WAL')

    // Database is new if it didn't exist before we opened it
    this.isNewDatabase = !dbExists

    // Check schema version and migrate if needed
    this.migrateSchema()

    // Prepare statements
    this.getSourceFileIdStmt = this.db.prepare(`
      SELECT id FROM source_file WHERE source_path = ?
    `)

    this.insertSourceFileStmt = this.db.prepare(`
      INSERT INTO source_file (source_path) VALUES (?)
      ON CONFLICT(source_path) DO UPDATE SET source_path = source_path
      RETURNING id
    `)

    this.selectTranslationStmt = this.db.prepare(`
      SELECT id, target_text, text_pos, used
      FROM translations
      WHERE engine_name = ?
        AND source_lang = ?
        AND target_lang = ?
        AND source_file_id = ?
        AND text_pos = ?
        AND source_text = ?
        AND context = ?
    `)

    this.selectTranslationFallbackStmt = this.db.prepare(`
      SELECT id, target_text, text_pos, used
      FROM translations
      WHERE engine_name = ?
        AND source_lang = ?
        AND target_lang = ?
        AND source_text = ?
        AND context = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `)

    this.insertTranslationStmt = this.db.prepare(`
      INSERT INTO translations (
        engine_name, source_lang, target_lang, source_file_id, text_pos,
        source_text, context, target_text, used, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'))
      ON CONFLICT(engine_name, source_lang, target_lang, source_file_id, text_pos, source_text, context)
      DO UPDATE SET target_text = excluded.target_text, updated_at = excluded.updated_at
      RETURNING id
    `)

    this.updateTextPosStmt = this.db.prepare(`
      UPDATE translations SET text_pos = ?, updated_at = strftime('%s','now')
      WHERE id = ?
    `)

    this.updateUsedStmt = this.db.prepare(`
      UPDATE translations SET used = 1
      WHERE id = ?
    `)
  }

  /**
   * Migrate the database schema to the latest version
   */
  private migrateSchema(): void {
    const currentVersion = this.getSchemaVersion()
    const startVersion = currentVersion > 0 ? currentVersion : 0

    if (startVersion >= LATEST_SCHEMA_VERSION) {
      return
    }

    if (currentVersion <= 0) {
      this.logger.info('No schema version found. Recreating database schema.')
    } else {
      this.logger.info(`Migrating schema from version ${startVersion} to ${LATEST_SCHEMA_VERSION}`)
    }

    this.runMigrations(startVersion)
  }

  /**
   * Execute one migration step identified by version
   */
  private migrate(version: number): void {
    switch (version) {
      case 0:
        this.logger.info('Migration step 0: dropping all tables')
        this.dropAllTables()
        return

      case 1:
        this.logger.info('Migration step 1: creating schema version 1')
        this.createSchemaV1()
        return

      case 2:
        this.logger.info('Migration step 2: migrating schema from version 1 to 2')
        this.migrateV1ToV2()
        return

      default:
        throw new Error(`Unsupported schema migration version: ${version}`)
    }
  }

  /**
   * Get the current schema version
   */
  private getSchemaVersion(): number {
    try {
      const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as any
      return row?.version ?? 0
    } catch {
      return 0
    }
  }

  /**
   * Set the schema version
   */
  private setSchemaVersion(version: number): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
      DELETE FROM schema_version;
      INSERT INTO schema_version (version) VALUES (${version});
    `)
  }

  /**
   * Drop all tables
   */
  private dropAllTables(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS translations;
      DROP TABLE IF EXISTS source_file;
      DROP TABLE IF EXISTS schema_version;
    `)
  }

  /**
   * Create the database schema (version 1)
   */
  private createSchemaV1(): void {
    this.db.exec(`
      CREATE TABLE source_file (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL UNIQUE
      );

      CREATE TABLE translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        engine_name TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source_file_id INTEGER NOT NULL,
        text_pos INTEGER NOT NULL,
        source_text TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        target_text TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        UNIQUE(engine_name, source_lang, target_lang, source_file_id, text_pos, source_text, context),
        FOREIGN KEY(source_file_id) REFERENCES source_file(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_translations_lookup
        ON translations(engine_name, source_lang, target_lang, source_file_id, text_pos, source_text, context);
    `)
  }

  /**
   * Migrate schema from version 1 to version 2
   * Adds 'used' column and index for mark-and-sweep purging
   */
  private migrateV1ToV2(): void {
    const columns = this.db.pragma('table_info(translations)') as Array<{ name: string }>
    const hasUsedColumn = columns.some(column => column.name === 'used')

    if (!hasUsedColumn) {
      this.db.exec(`
        ALTER TABLE translations ADD COLUMN used INTEGER NOT NULL DEFAULT 1;
      `)
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_translations_used ON translations(used);
    `)
  }

  /**
   * Run migrations from the current version to the latest
   */
  private runMigrations(fromVersion: number): void {
    let version = fromVersion

    try {
      if (version <= 0) {
        this.migrate(0)
        version = 0
      }

      while (version < LATEST_SCHEMA_VERSION) {
        const nextVersion = version + 1
        this.migrate(nextVersion)
        this.setSchemaVersion(nextVersion)
        version = nextVersion
      }
    } catch (error) {
      this.logger.warn(`Migration failed, recreating schema: ${error}`)

      this.migrate(0)
      this.migrate(1)
      this.migrate(2)
      this.setSchemaVersion(LATEST_SCHEMA_VERSION)
    }
  }

  /**
   * Create a SQLite cache from a workspace path
   */
  static async createFromWorkspace(
    workspacePath: string,
    fileSystem: FileSystem,
    logger?: Logger
  ): Promise<SQLiteCache> {
    const cacheDir = path.join(workspacePath, TRANSLATOR_DIR)
    const dbPath = path.join(cacheDir, 'translation.db')

    // Ensure the cache directory exists
    await fileSystem.createDirectory(fileSystem.createUri(cacheDir))

    return new SQLiteCache(dbPath, workspacePath, logger)
  }

  /**
   * Get or create source_file_id for a given path
   */
  private getOrCreateSourceFileId(sourcePath: string): number {
    const normalizedPath = toWorkspaceRelativePosix(sourcePath, this.workspacePath)
    const existing = this.getSourceFileIdStmt.get(normalizedPath) as any
    if (existing) {
      return existing.id
    }
    const result = this.insertSourceFileStmt.get(normalizedPath) as any
    return result.id
  }

  async hasSourcePath(sourcePath: string): Promise<boolean> {
    const normalizedPath = toWorkspaceRelativePosix(sourcePath, this.workspacePath)
    const row = this.getSourceFileIdStmt.get(normalizedPath) as { id?: number } | undefined
    return Boolean(row?.id)
  }

  async hasPendingPurge(): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 as has_unused FROM translations WHERE used = 0 LIMIT 1').get() as
      | { has_unused?: number }
      | undefined
    return row?.has_unused === 1
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
    const SEPARATOR = '::' // Must match the separator in bulkTranslate.ts

    // Get source_file_id if sourcePath is provided
    const sourceFileId = sourcePath ? this.getOrCreateSourceFileId(sourcePath) : 0

    this.db.transaction(() => {
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i]
        const c = (contexts[i] ?? '').toString()
        const pos = positions[i] ?? 0

        let row = this.selectTranslationStmt.get(
          engine, source, target, sourceFileId, pos, t, c
        ) as any

        // Fallback lookup for renamed/moved files: reuse any matching cached translation
        // when strict same-file/same-position lookup misses.
        if (!row) {
          row = this.selectTranslationFallbackStmt.get(
            engine, source, target, t, c
          ) as any
        }

        if (row) {
                    // Mark as used (only update if not already used)
                    if (!row.used) {
                      this.updateUsedStmt.run(row.id)
                    }

          out.set(`${t}${SEPARATOR}${c}`, {
            translation: row.target_text,
            textPos: row.text_pos
          })
        }
      }
    })()

    return out
  }

  async putMany({
    engine,
    source,
    target,
    pairs,
    sourcePath = ''
  }: {
    engine: string;
    source: string;
    target: string;
    pairs: Pair[];
    sourcePath?: string;
  }): Promise<void> {
    // Get or create source_file_id
    const sourceFileId = sourcePath ? this.getOrCreateSourceFileId(sourcePath) : 0

    this.db.transaction(() => {
      for (const { src, dst, ctx, pos } of pairs) {
        const context = (ctx ?? '').toString()
        const textPos = pos ?? 0

        this.insertTranslationStmt.run(
          engine, source, target, sourceFileId, textPos,
          src, context, dst
        )
      }
    })()
  }

  async exportCSV(filePath: string): Promise<void> {
    // Query to join translations with source_file and order by source_path, text_pos, target_lang
    const rows = this.db
      .prepare(`
        SELECT
          sf.source_path,
          t.text_pos,
          t.engine_name,
          t.source_lang,
          t.target_lang,
          t.source_text,
          t.context,
          t.target_text,
          t.updated_at
        FROM translations t
        INNER JOIN source_file sf ON t.source_file_id = sf.id
        ORDER BY sf.source_path, t.text_pos, t.target_lang
      `)
      .all() as any[]

    // Convert to CSV format
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

    // Parse CSV
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      cast: (value, context) => {
        // Cast text_pos and updated_at to numbers
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
      updated_at: number
    }>

    let imported = 0

    // Transaction to replace all data
    this.db.transaction(() => {
      // Clear existing data
      this.db.exec('DELETE FROM translations')
      this.db.exec('DELETE FROM source_file')

      // Import new data
      for (const record of records) {
        // Upsert source_file and get id
        const sourceFileId = this.getOrCreateSourceFileId(record.source_path)

        // Insert translation
        const updatedAt = record.updated_at || Math.floor(Date.now() / 1000)
        const context = record.context ?? ''

        this.db.prepare(`
          INSERT INTO translations (
            engine_name, source_lang, target_lang, source_file_id, text_pos,
            source_text, context, target_text, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(engine_name, source_lang, target_lang, source_file_id, text_pos, source_text, context)
          DO UPDATE SET target_text = excluded.target_text, updated_at = excluded.updated_at
        `).run(
          record.engine_name,
          record.source_lang,
          record.target_lang,
          sourceFileId,
          record.text_pos,
          record.source_text,
          context,
          record.target_text,
          updatedAt
        )

        imported++
      }
    })()

    this.logger.info(`Imported ${imported} translations from ${filePath}`)

    return imported
  }

  /**
   * Purge unused translations from the cache
   * Sets all rows to used=0, then caller should retranslate files, then delete unused rows
   */
  async purge(): Promise<{ deletedCount: number }> {
    let deletedCount = 0

    this.db.transaction(() => {
      // First, mark all translations as unused
      this.db.exec('UPDATE translations SET used = 0')

      // After this, the caller should trigger retranslation which will mark used translations
      // Then come back and delete unused rows
    })()

    this.logger.info('Marked all translations as unused. Retranslate files to mark used translations.')

    return { deletedCount }
  }

  /**
   * Complete the purge by deleting all unused translations
   */
  async completePurge(): Promise<{ deletedCount: number }> {
    const result = this.db.prepare('DELETE FROM translations WHERE used = 0').run()
    const deletedCount = result.changes

    this.logger.info(`Purged ${deletedCount} unused translations`)

    return { deletedCount }
  }

  close() {
    this.logger.debug('Closing SQLite cache')
    this.db.close()
  }

  /**
   * Check if this database was just created (did not exist before initialization)
   */
  isNew(): boolean {
    return this.isNewDatabase
  }
}