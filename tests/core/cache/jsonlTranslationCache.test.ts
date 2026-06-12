import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
      source: 'en',
      target: 'fr',
      pairs: [
        { src: 'Save', dst: 'Enregistrer', ctx: 'button', pos: 0 },
        { src: 'Save', dst: 'Sauvegarder', ctx: 'menu', pos: 1 }
      ],
      sourcePath: 'src/messages.json'
    })

    const result = await cache.getMany({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu'],
      sourcePath: 'src/messages.json',
      positions: [0, 1]
    })

    expect(result.get('Save::button')?.translation).toBe('Enregistrer')
    expect(result.get('Save::menu')?.translation).toBe('Sauvegarder')
  })

  it('persists data across reopen', async () => {
    let cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'google',
      source: 'en',
      target: 'es',
      pairs: [{ src: 'Hello', dst: 'Hola', pos: 3 }],
      sourcePath: 'src/a.json'
    })

    cache.close()

    cache = new JsonlTranslationCache(cachePath, dir)
    const result = await cache.getMany({
      engine: 'google',
      source: 'en',
      target: 'es',
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
      source: 'en',
      target: 'fr',
      pairs: [{ src: 'Save', dst: 'Enregistrer', pos: 7 }],
      sourcePath: 'old/path/file.json'
    })

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
    expect(result.get('Save::')?.textPos).toBe(7)
  })

  it('supports export and import CSV', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      pairs: [{ src: 'Hello', dst: 'Hallo', pos: 0 }],
      sourcePath: 'src/messages.json'
    })

    const csvPath = join(dir, 'cache.csv')
    await cache.exportCSV(csvPath)

    expect(existsSync(csvPath)).toBe(true)
    expect(readFileSync(csvPath, 'utf8')).toContain('source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,verified,updated_at')

    const restored = new JsonlTranslationCache(join(dir, 'restored.jsonl'), dir)
    const imported = await restored.importCSV(csvPath)

    expect(imported).toBe(1)

    const result = await restored.getMany({
      engine: 'test',
      source: 'en',
      target: 'de',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'src/messages.json',
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
      source: 'en',
      target: 'fr',
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
      source: 'en',
      target: 'fr',
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
      source: 'en',
      target: 'fr',
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
      source: 'en',
      target: 'it',
      pairs: [{ src: 'Hello', dst: 'Ciao', pos: 0 }],
      sourcePath: 'src/test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'it',
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
      source: 'en',
      target: 'pt',
      pairs: [{ src: 'Hello', dst: 'Ola', pos: 0 }],
      sourcePath: 'src/test.json'
    })

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'pt',
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
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text\nfile.json,0,test,en,fr,Hello,,Bonjour\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const result = await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'file.json',
      positions: [0]
    })

    expect(result.get('Hello::')?.translation).toBe('Bonjour')

    const exportedPath = join(dir, 'no-updated-at-export.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ source_text: string; verified: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].verified).toBe('false')
  })

  it('imports and exports verified flag from CSV', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)
    const csvPath = join(dir, 'verified.csv')

    writeFileSync(
      csvPath,
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,verified,updated_at\nfile.json,0,test,en,fr,Hello,,Bonjour,true,12345\n',
      'utf8'
    )

    const imported = await cache.importCSV(csvPath)
    expect(imported).toBe(1)

    const exportedPath = join(dir, 'verified-export.csv')
    await cache.exportCSV(exportedPath)

    const rows = parse(readFileSync(exportedPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true
    }) as Array<{ source_text: string; verified: string; updated_at: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].source_text).toBe('Hello')
    expect(rows[0].verified).toBe('true')
    expect(rows[0].updated_at).toBe('12345')
  })

  it('treats source directory as present when cached file entries exist under it', async () => {
    const cache = new JsonlTranslationCache(cachePath, dir)

    await cache.putMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
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
      'source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,verified,updated_at\nfile.json,0,test,en,fr,Hello,,Bonjour,false,12345\n',
      'utf8'
    )

    await cache.importCSV(csvPath)

    await cache.purge()
    await cache.getMany({
      engine: 'test',
      source: 'en',
      target: 'fr',
      texts: ['Hello'],
      contexts: [null],
      sourcePath: 'file.json',
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
