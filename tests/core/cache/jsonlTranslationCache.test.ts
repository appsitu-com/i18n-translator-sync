import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { JsonlTranslationCache } from '../../../src/core/cache/jsonlTranslationCache'
import { FileSystem } from '../../../src/core/util/fs'
import { Logger } from '../../../src/core/util/baseLogger'

function makeTmpDir(prefix = 'i18n-jsonl-cache-test-') {
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

function createMockFileSystem(): FileSystem {
  return {
    createDirectory: vi.fn().mockResolvedValue(undefined),
    createUri: vi.fn((p: string) => ({ fsPath: p })),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
    delete: vi.fn(),
    readDirectory: vi.fn(),
    stat: vi.fn()
  } as unknown as FileSystem
}

const V1_CACHE_FIXTURE_PATH = join(process.cwd(), 'test-project', '.translator', 'translation-v1.jsonl')
const TS_EXAMPLE_SOURCE_PATH = join(process.cwd(), 'test-project', 'i18n', 'en', 'ts-example', 'messages.ts')

describe('JsonlTranslationCache', () => {
  let dir: string
  let cachePath: string

  beforeEach(() => {
    dir = makeTmpDir()
    cachePath = join(dir, 'cache.jsonl')
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors.
    }
  })

  it('stores and retrieves entries with strict context + position keys', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [
        { src: 'Save', dst: 'Enregistrer', ctx: 'button', pos: 0 },
        { src: 'Save', dst: 'Sauvegarder', ctx: 'menu', pos: 1 }
      ],
      sourcePath: 'src/messages.json'
    })

    const result = await cache.getMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'src/messages.json',
      positions: [0, 1]
    })

    expect(result.get('Save::button')?.translation).toBe('Enregistrer')
    expect(result.get('Save::menu')?.translation).toBe('Sauvegarder')
  })

  it('stores structured path positions as cache keys', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Hello', dst: 'Bonjour', pos: 'user.profile.title' }],
      sourcePath: 'src/messages.json'
    })

    const result = await cache.getMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: ['user.profile.title']
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')
    expect(result.get('Hello::')?.textPos).toBe('user.profile.title')
  })

  it('migrates schema v1 JSONL numeric positions to structured paths', async () => {
    const sourceDir = join(dir, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    writeFileSync(
      cachePath,
      '{"type":"meta","schemaVersion":1}\n' +
        '{"type":"entry","engine":"test","source":"en","target":"fr","sourcePath":"src/messages.json","textPos":0,"sourceText":"Hello","context":"","targetText":"Bonjour","status":"ai_draft","used":true,"updatedAt":12345}\n',
      'utf8'
    )

    const cache = new JsonlTranslationCache(cachePath, dir)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: ['greeting']
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')
    expect(result.get('Hello::')?.textPos).toBe('greeting')

    const rewritten = readFileSync(cachePath, 'utf8')
    expect(rewritten).toContain('"schemaVersion":2')
    expect(rewritten).toContain('"textPos":"greeting"')
  })

  it('finds fallback matches from the archived v1 JSONL snapshot even when the source path changes', async () => {
    const sourceDir = join(dir, 'i18n', 'en', 'ts-example')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.ts'), readFileSync(TS_EXAMPLE_SOURCE_PATH, 'utf8'), 'utf8')
    writeFileSync(cachePath, readFileSync(V1_CACHE_FIXTURE_PATH, 'utf8'), 'utf8')

    const cache = new JsonlTranslationCache(cachePath, dir)

    expect(cache.didMigrateFromV1()).toBe(true)

    const result = await cache.getMany({
      engine: 'azure',
      sourceLocale: 'es',
      targetLocale: 'en',
      texts: [
        '¡Adiós, mundo!',
        'Bienvenido al sistema de traducción.',
        'Gracias por utilizar nuestro servicio.'
      ],
      contexts: [null, null, null],
      sourcePath: 'i18n/en/ts-example/messages-renamed.ts',
      positions: ['farewell', 'nested.welcome', 'nested.thanks']
    })

    expect(result.get('¡Adiós, mundo!::')?.translation).toBe('Goodbye, world!')
    expect(result.get('Bienvenido al sistema de traducción.::')?.translation).toBe('Welcome to the translation system.')
    expect(result.get('Gracias por utilizar nuestro servicio.::')?.translation).toBe('Thank you for using our service.')
  })

  it('drops legacy numeric textPos when the structured source file is missing', async () => {
    writeFileSync(
      cachePath,
      '{"type":"meta","schemaVersion":1}\n' +
        '{"type":"entry","engine":"test","source":"en","target":"fr","sourcePath":"src/messages.json","textPos":0,"sourceText":"Hello","context":"","targetText":"Bonjour","status":"ai_draft","used":true,"updatedAt":12345}\n',
      'utf8'
    )

    const cache = new JsonlTranslationCache(cachePath, dir)

    expect(cache.didMigrateFromV1()).toBe(true)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: ['greeting']
    })

    expect(result.size).toBe(0)
  })

  it('falls back to legacy numeric textPos when v1 migration sourcePath is a directory', async () => {
    writeFileSync(
      cachePath,
      '{"type":"meta","schemaVersion":1}\n' +
        '{"type":"entry","engine":"test","source":"en","target":"fr","sourcePath":"i18n/en","textPos":0,"sourceText":"Hello","context":"","targetText":"Bonjour","status":"ai_draft","used":true,"updatedAt":12345}\n',
      'utf8'
    )

    const cache = new JsonlTranslationCache(cachePath, dir)

    expect(cache.didMigrateFromV1()).toBe(true)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: ['greeting']
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')
    expect(result.get('Hello::')?.textPos).toBe('greeting')
  })

  it('removes legacy sqlite cache files during v1 to v2 migration', async () => {
    const sourceDir = join(dir, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    const legacyDir = join(dir, '.translator')
    mkdirSync(legacyDir, { recursive: true })
    const legacyDb = join(legacyDir, 'translation.db')
    const legacyWal = `${legacyDb}-wal`
    const legacyShm = `${legacyDb}-shm`

    writeFileSync(legacyDb, 'legacy-db', 'utf8')
    writeFileSync(legacyWal, 'legacy-wal', 'utf8')
    writeFileSync(legacyShm, 'legacy-shm', 'utf8')

    writeFileSync(
      cachePath,
      '{"type":"meta","schemaVersion":1}\n' +
        '{"type":"entry","engine":"test","source":"en","target":"fr","sourcePath":"src/messages.json","textPos":0,"sourceText":"Hello","context":"","targetText":"Bonjour","status":"ai_draft","used":true,"updatedAt":12345}\n',
      'utf8'
    )

    const cache = new JsonlTranslationCache(cachePath, dir)

    expect(cache.didMigrateFromV1()).toBe(true)
    expect(existsSync(legacyDb)).toBe(false)
    expect(existsSync(legacyWal)).toBe(false)
    expect(existsSync(legacyShm)).toBe(false)
  })

  it('persists data across reopen', async () => {
    let cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'google',
      sourceLocale: 'en',
      targetLocale: 'es',
      pairs: [{ src: 'Hello', dst: 'Hola', pos: 3 }],
      sourcePath: 'src/a.json'
    })

    cache.close()

    cache = new JsonlTranslationCache(cachePath, dir)
    const result = await cache.getMany({
      engine: 'google',
      sourceLocale: 'en',
      targetLocale: 'es',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/a.json',
      positions: [3]
    })

    expect(result.get('Hello::')?.translation).toBe('Hola')
    expect(result.get('Hello::')?.textPos).toBe(3)
  })

  it('supports fallback lookup across renamed source files', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 7 }],
      sourcePath: 'old/path/file.json'
    })

    const result = await cache.getMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: [0]
    })

    expect(result.get('Save::')?.translation).toBe('Enregistrer')
    expect(result.get('Save::')?.textPos).toBe(0)
  })

  it('matches entries when source text differs only by edge whitespace', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'azure',
      sourceLocale: 'en',
      targetLocale: 'es',
      pairs: [{ src: 'Gasp ', dst: 'Jadeo', pos: 't2' }],
      sourcePath: 'i18n/en.json'
    })

    const result = await cache.getMany({
      engine: 'azure',
      sourceLocale: 'en',
      targetLocale: 'es',
      texts: ['Gasp'],
      contexts: [null],
      sourcePath: 'i18n/en.json',
      positions: ['t2']
    })

    expect(result.get('Gasp::')?.translation).toBe('Jadeo')
    expect(result.get('Gasp::')?.textPos).toBe('t2')
  })

  it('promotes fallback entries to exact path-based textPos matches', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 7 }],
      sourcePath: 'old/path/file.json'
    })

    const firstResult = await cache.getMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: ['menu.save']
    })

    expect(firstResult.get('Save::')?.translation).toBe('Enregistrer')
    expect(firstResult.get('Save::')?.textPos).toBe('menu.save')

    const secondResult = await cache.getMany({
      engine: 'deepl',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: ['menu.save']
    })

    expect(secondResult.get('Save::')?.translation).toBe('Enregistrer')
    expect(secondResult.get('Save::')?.textPos).toBe('menu.save')
  })

  it('keeps promoted exact matches and purges unused fallback rows', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 7 }],
      sourcePath: 'old/path/file.json'
    })

    await cache.purge()

    const promotedLookup = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: ['menu.save']
    })

    expect(promotedLookup.get('Save::')?.translation).toBe('Enregistrer')
    expect(promotedLookup.get('Save::')?.textPos).toBe('menu.save')

    const purgeResult = await cache.completePurge()
    expect(purgeResult.deletedCount).toBe(1)

    const remaining = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: [null],
      sourcePath: 'new/path/file.json',
      positions: ['menu.save']
    })

    expect(remaining.get('Save::')?.translation).toBe('Enregistrer')
    expect(remaining.get('Save::')?.textPos).toBe('menu.save')
  })

  it('promotes fallback from directory-scoped legacy rows for structured lookups', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Title', dst: 'Titre', pos: 'nested.title' }],
      sourcePath: 'i18n/en'
    })

    const firstResult = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Title'],
      contexts: [null],
      sourcePath: 'i18n/en/messages.json',
      positions: ['nested.title']
    })

    expect(firstResult.get('Title::')?.translation).toBe('Titre')
    expect(firstResult.get('Title::')?.textPos).toBe('nested.title')

    await cache.purge()

    const secondResult = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Title'],
      contexts: [null],
      sourcePath: 'i18n/en/messages.json',
      positions: ['nested.title']
    })

    expect(secondResult.get('Title::')?.translation).toBe('Titre')
    expect(secondResult.get('Title::')?.textPos).toBe('nested.title')
  })

  it('supports export and import CSV', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'de',
      pairs: [{ src: 'Hello', dst: 'Hallo', pos: 0 }],
      sourcePath: 'src/messages.md'
    })

    const csvPath = join(dir, 'cache.csv')
    await cache.exportCSV(csvPath)

    expect(existsSync(csvPath)).toBe(true)
    expect(readFileSync(csvPath, 'utf8')).toContain('source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,updated_at')

    const restored = new JsonlTranslationCache(join(dir, 'restored.jsonl'), dir)
    const imported = await restored.importCSV(csvPath)

    expect(imported).toBe(1)

    const result = await restored.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'de',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.md',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Hallo')
  })

  it('handles missing CSV imports', async () => {
    const logger = createMockLogger()
    const cache = new JsonlTranslationCache(cachePath, dir, logger)

    const imported = await cache.importCSV(join(dir, 'missing.csv'))

    expect(imported).toBe(0)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('implements purge mark-and-sweep parity', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [
        { src: 'One', dst: 'Un', pos: 0 },
        { src: 'Two', dst: 'Deux', pos: 1 }
      ],
      sourcePath: 'src/messages.json'
    })

    await cache.purge()
    expect(await cache.hasPendingPurge()).toBe(true)

    await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['One'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: [0]
    })

    const purgeResult = await cache.completePurge()

    expect(purgeResult.deletedCount).toBe(1)
    expect(await cache.hasPendingPurge()).toBe(false)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['One', 'Two'],
      contexts: [null, null],
      sourcePath: 'src/messages.json',
      positions: [0, 1]
    })

    expect(result.get('One::')?.translation).toBe('Un')
    expect(result.has('Two::')).toBe(false)
  })

  it('supports createFromWorkspace', async () => {
    const logger = createMockLogger()
    const fileSystem = createMockFileSystem()

    const cache = await JsonlTranslationCache.createFromWorkspace(dir, fileSystem, logger)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'it',
      pairs: [{ src: 'Hello', dst: 'Ciao', pos: 0 }],
      sourcePath: 'src/test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'it',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/test.json',
      positions: [0]
    })

    expect(fileSystem.createDirectory).toHaveBeenCalled()
    expect(result.get('Hello::')?.translation).toBe('Ciao')
  })

  it('supports memory-only mode with :memory:', async () => {
    const cache = new JsonlTranslationCache(':memory:', dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'pt',
      pairs: [{ src: 'Hello', dst: 'Ola', pos: 0 }],
      sourcePath: 'src/test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'pt',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/test.json',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Ola')
  })

  it('imports CSV rows without updated_at', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'no-updated-at.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text\nfile.md,0,test,en,fr,Hello,,Bonjour\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'file.md',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')

    const exportedPath = join(dir, 'no-updated-at-export.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ source_text: string; status: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].status).toBe('ai_draft')
  })

  it('imports and exports status field from CSV', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'status.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,updated_at\nfile.md,0,test,en,fr,Hello,,Bonjour,reviewed,12345\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const exportedPath = join(dir, 'status-export.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ source_text: string; status: string; updated_at: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].status).toBe('reviewed')
    expect(rows[0].updated_at).toBe('12345')
  })

  it('preserves string path text_pos through CSV import and export', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'path-text-pos.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,updated_at\nfile.json,items[0].name,test,en,fr,Hello,,Bonjour,reviewed,12345\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const exportedPath = join(dir, 'path-text-pos-export.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ text_pos: string; source_text: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].text_pos).toBe('items[0].name')
  })

  it('drops legacy numeric structured rows during CSV import', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'legacy-structured-numeric.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,updated_at\nsrc/messages.json,0,test,en,fr,Hello,,Bonjour,reviewed,12345\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(0)

    const result = await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
      positions: ['greeting']
    })

    expect(result.size).toBe(0)
  })

  it('treats source directory as present when cached file entries exist under it', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      pairs: [{ src: 'Hello', dst: 'Bonjour', pos: 0 }],
      sourcePath: 'i18n/en/messages.json'
    })

    expect(await cache.hasSourcePath('i18n/en')).toBe(true)
    expect(await cache.hasSourcePath('i18n/en/messages.json')).toBe(true)
    expect(await cache.hasSourcePath('i18n/other')).toBe(false)
  })

  it('preserves updated_at when purge only re-marks used entries', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'seed.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,updated_at\nfile.md,0,test,en,fr,Hello,,Bonjour,ai_draft,12345\n',
      'utf8'
    )

    await cache.importCSV(csvPath)

    await cache.purge()
    await cache.getMany({
      engine: 'test',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'file.md',
      positions: [0]
    })
    await cache.completePurge()

    const exportedPath = join(dir, 'after-purge.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ updated_at: string; source_text: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].updated_at).toBe('12345')
  })

})
