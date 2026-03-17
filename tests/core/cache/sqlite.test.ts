import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SQLiteCache, NodeSQLiteCache } from '../../../src/core/cache/sqlite'
import { FileSystem } from '../../../src/core/util/fs'
import { Logger } from '../../../src/core/util/baseLogger'

function makeTmpDir(prefix = 'i18n-cache-test-') {
  return mkdtempSync(join(tmpdir(), prefix))
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

function createMockFileSystem(dir: string): FileSystem {
  return {
    createDirectory: vi.fn().mockResolvedValue(undefined),
    createUri: vi.fn((p: string) => ({ fsPath: p })),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
    delete: vi.fn(),
    readDirectory: vi.fn(),
    stat: vi.fn()
  } as any
}

describe('SQLiteCache (better-sqlite3 real DB)', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = makeTmpDir()
    dbPath = join(dir, 'cache.db')
    console.log('Using temp cache DB:', dbPath)
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it('putMany/getMany respects context in PK and persists across reopen', async () => {
    // 1) create + write
    let cache = new SQLiteCache(dbPath, dir)

    // miss first
    let got = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'test/file.json',
      positions: [0, 1]
    })
    expect(got.size).toBe(0)

    // put both contexts
    await cache.putMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      pairs: [
        { src: 'Save', dst: 'Enregistrer', ctx: 'button', pos: 0 },
        { src: 'Save', dst: 'Sauvegarder', ctx: 'menu', pos: 1 }
      ],
      sourcePath: 'test/file.json'
    })

    // hit now
    got = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'test/file.json',
      positions: [0, 1]
    })
    expect(got.get('Save::button')?.translation).toBe('Enregistrer')
    expect(got.get('Save::button')?.translation).toBe('Enregistrer')
    expect(got.get('Save::menu')?.translation).toBe('Sauvegarder')

    cache.close()

    // 2) reopen & verify persistence
    cache = new SQLiteCache(dbPath, dir)
    const again = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'test/file.json',
      positions: [0, 1]
    })
    expect(again.get('Save::button')?.translation).toBe('Enregistrer')
    expect(again.get('Save::menu')?.translation).toBe('Sauvegarder')

    // 3) upsert update
    await cache.putMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      pairs: [{ src: 'Save', dst: 'Mettre de côté', ctx: 'menu', pos: 1 }],
      sourcePath: 'test/file.json'
    })
    const afterUpdate = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save'],
      contexts: ['menu'],
      sourcePath: 'test/file.json',
      positions: [1]
    })
    expect(afterUpdate.get('Save::menu')?.translation).toBe('Mettre de côté')

    // 4) CSV export/import round-trip to a fresh DB
    const csvPath = join(dir, 'cache.csv')
    await cache.exportCSV(csvPath)
    expect(existsSync(csvPath)).toBe(true)
    const csvText = readFileSync(csvPath, 'utf8')
    expect(csvText.split(/\r?\n/)[0]).toMatch(
      /source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,updated_at/
    )

    cache.close()

    // Fresh DB + import
    const db2 = join(dir, 'cache2.db')
    let cache2 = new SQLiteCache(db2, dir)
    const imported = await cache2.importCSV(csvPath)
    expect(imported).toBeGreaterThan(0)

    const hitImported = await cache2.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'test/file.json',
      positions: [0, 1]
    })
    expect(hitImported.get('Save::button')?.translation).toBe('Enregistrer')
    expect(hitImported.get('Save::menu')?.translation).toBe('Mettre de côté')

    cache2.close()
  })

  it('tracks and returns text_pos for each translation', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Put translations with positions
    await cache.putMany({
      engine: 'google',
      source: 'en',
      target: 'es',
      pairs: [
        { src: 'Hello', dst: 'Hola', pos: 0 },
        { src: 'World', dst: 'Mundo', pos: 1 },
        { src: 'Hello', dst: 'Hola', pos: 5 } // same text, different position
      ],
      sourcePath: 'test/messages.json'
    })

    // Get and verify text_pos is returned
    const result = await cache.getMany({
      engine: 'google',
      source: 'en',
      target: 'es',
      texts: ['Hello', 'World', 'Hello'],
      contexts: [null, null, null],
      sourcePath: 'test/messages.json',
      positions: [0, 1, 5]
    })

    expect(result.get('Hello::')?.translation).toBe('Hola')
    expect(result.get('Hello::')?.textPos).toBe(5) // Should be the last one (pos: 5)
    expect(result.get('World::')?.translation).toBe('Mundo')
    expect(result.get('World::')?.textPos).toBe(1)

    cache.close()
  })

  it('handles multiple source files with same text', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Same text in different files
    await cache.putMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 0 }],
      sourcePath: 'file1.json'
    })

    await cache.putMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'Save', dst: 'Sauvegarder', pos: 0 }],
      sourcePath: 'file2.json'
    })

    // Get from file1
    const result1 = await cache.getMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'file1.json',
      positions: [0]
    })
    expect(result1.get('Save::')?.translation).toBe('Enregistrer')

    // Get from file2
    const result2 = await cache.getMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'file2.json',
      positions: [0]
    })
    expect(result2.get('Save::')?.translation).toBe('Sauvegarder')

    cache.close()
  })

  it('falls back to any file and position for renamed or moved source files', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    await cache.putMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 7 }],
      sourcePath: 'old/path/file.json'
    })

    // Simulate file rename/move where both source_path and text_pos changed.
    const result = await cache.getMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: [0]
    })

    expect(result.get('Save::')?.translation).toBe('Enregistrer')
    // Returned text position should be the cached one from the prior location.
    expect(result.get('Save::')?.textPos).toBe(7)

    cache.close()
  })

  it('handles CSV import when file does not exist', async () => {
    const logger = createMockLogger()
    const cache = new SQLiteCache(dbPath, dir, logger)

    const nonExistentPath = join(dir, 'does-not-exist.csv')
    const imported = await cache.importCSV(nonExistentPath)

    expect(imported).toBe(0)
    expect(logger.warn).toHaveBeenCalledWith(`CSV file not found: ${nonExistentPath}`)

    cache.close()
  })

  it('handles empty CSV import', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Create empty CSV with just headers
    const csvPath = join(dir, 'empty.csv')
    writeFileSync(csvPath, 'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,updated_at\n', 'utf8')

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(0)

    cache.close()
  })

  it('logs when closing cache', async () => {
    const logger = createMockLogger()
    const cache = new SQLiteCache(dbPath, dir, logger)

    cache.close()

    expect(logger.debug).toHaveBeenCalledWith('Closing SQLite cache')
  })

  it('handles CSV import without updated_at values', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Create CSV without updated_at column
    const csvPath = join(dir, 'no-timestamp.csv')
    const csvContent = 'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text\ntest.json,0,test,en,fr,Hello,,Bonjour\n'
    writeFileSync(csvPath, csvContent, 'utf8')

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'test.json',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')

    cache.close()
  })

  it('handles missing positions array gracefully', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Put with mixed positions
    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      pairs: [
        { src: 'One', dst: 'Un', pos: 0 },
        { src: 'Two', dst: 'Deux' } // no pos - should default to 0
      ],
      sourcePath: 'test.json'
    })

    // Get without positions array - should use defaults
    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['One', 'Two'],
      contexts: [null, null],
      sourcePath: 'test.json'
      // No positions provided - should default
    })

    expect(result.size).toBeGreaterThan(0)

    cache.close()
  })
})

describe('NodeSQLiteCache wrapper', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = makeTmpDir()
    dbPath = join(dir, 'node-cache.db')
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it('delegates all methods to underlying SQLiteCache', async () => {
    const logger = createMockLogger()
    const cache = new NodeSQLiteCache(logger, dbPath, dir)

    // Test initialize (no-op)
    await cache.initialize()

    // Test getMany
    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['test'],
      contexts: [null],
      sourcePath: 'file.json',
      positions: [0]
    })
    expect(result).toBeInstanceOf(Map)

    // Test putMany
    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'test', dst: 'test-fr', pos: 0 }],
      sourcePath: 'file.json'
    })

    // Verify the put worked
    const afterPut = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['test'],
      contexts: [null],
      sourcePath: 'file.json',
      positions: [0]
    })
    expect(afterPut.get('test::')?.translation).toBe('test-fr')

    // Test exportCSV
    const csvPath = join(dir, 'export.csv')
    await cache.exportCSV(csvPath)
    expect(existsSync(csvPath)).toBe(true)

    // Test importCSV
    const imported = await cache.importCSV(csvPath)
    expect(imported).toBeGreaterThan(0)

    // Test close
    cache.close()
  })
})

describe('SQLiteCache.createFromWorkspace', () => {
  let dir: string

  beforeEach(() => {
    dir = makeTmpDir()
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it('creates cache directory and initializes database', async () => {
    const logger = createMockLogger()
    const fs = createMockFileSystem(dir)

    const cache = await SQLiteCache.createFromWorkspace(dir, fs, logger)

    // Verify createDirectory was called for cache dir
    expect(fs.createDirectory).toHaveBeenCalled()
    const cacheDir = join(dir, '.translator')
    expect(fs.createUri).toHaveBeenCalledWith(cacheDir)

    // Verify cache is functional
    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      pairs: [{ src: 'test', dst: 'Test', pos: 0 }],
      sourcePath: 'test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      texts: ['test'],
      contexts: [null],
      sourcePath: 'test.json',
      positions: [0]
    })

    expect(result.get('test::')?.translation).toBe('Test')

    cache.close()
  })
})

describe('SQLiteCache schema migrations', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = makeTmpDir()
    dbPath = join(dir, 'migration-test.db')
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it('creates schema_version table on first use', async () => {
    const cache = new SQLiteCache(dbPath, dir)

    // Verify schema_version table exists and is set to 1
    const version = cache['getSchemaVersion']()
    expect(version).toBe(2)

    cache.close()
  })

  it('handles database without schema_version table', async () => {
    // Create a database without schema_version
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)

    // Create old schema (simulated legacy DB)
    db.exec(`
      CREATE TABLE translations (
        engine_name TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source_text TEXT NOT NULL,
        context TEXT NOT NULL,
        translated_text TEXT NOT NULL
      )
    `)
    db.close()

    // Open with SQLiteCache - should detect no schema_version and recreate
    const logger = createMockLogger()
    const cache = new SQLiteCache(dbPath, dir, logger)

    expect(logger.info).toHaveBeenCalledWith('No schema version found. Recreating database schema.')

    // Verify new schema is in place
    const version = cache['getSchemaVersion']()
    expect(version).toBe(2)

    // Verify cache works with new schema
    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'Hello', dst: 'Bonjour', pos: 0 }],
      sourcePath: 'test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'test.json',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')

    cache.close()
  })

  it('runs migrations for old schema versions', async () => {
    // Create a database with schema_version = 0 (not the same as missing table)
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)

    // Create schema_version table with version 0
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (0);
    `)

    // Create old-style translations table
    db.exec(`
      CREATE TABLE translations (
        engine_name TEXT,
        source_text TEXT,
        translated_text TEXT
      )
    `)
    db.close()

    // Open with SQLiteCache - should detect version 0 and migrate
    const logger = createMockLogger()
    const cache = new SQLiteCache(dbPath, dir, logger)

    expect(logger.info).toHaveBeenCalledWith('No schema version found. Recreating database schema.')

    // Verify schema is now version 1
    const version = cache['getSchemaVersion']()
    expect(version).toBe(2)

    cache.close()
  })

  it('migrates from intermediate schema versions', async () => {
    // Create a database with an intermediate schema version (< 1 but not 0)
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)

    // Create schema_version table with version -1 (or 0.5, any value < 1 but not 0)
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (-1);
    `)

    // Create some old schema
    db.exec(`
      CREATE TABLE translations (
        engine_name TEXT,
        source_text TEXT,
        translated_text TEXT
      )
    `)
    db.close()

    // Open with SQLiteCache - should detect version < 1 and run migrations
    const logger = createMockLogger()
    const cache = new SQLiteCache(dbPath, dir, logger)

    expect(logger.info).toHaveBeenCalledWith('No schema version found. Recreating database schema.')

    // Verify schema is now version 1
    const version = cache['getSchemaVersion']()
    expect(version).toBe(2)

    // Verify new schema works
    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      pairs: [{ src: 'Test', dst: 'Prüfung', pos: 0 }],
      sourcePath: 'test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      texts: ['Test'],
      contexts: [null],
      sourcePath: 'test.json',
      positions: [0]
    })

    expect(result.get('Test::')?.translation).toBe('Prüfung')

    cache.close()
  })
})
