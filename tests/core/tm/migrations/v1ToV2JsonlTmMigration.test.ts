import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '../../../../src/core/util/baseLogger'
import type { TmEntry } from '../../../../src/core/tm/jsonlTmTypes'
import * as extractorRegistry from '../../../../src/extractors/extractorRegistry'
import { V1ToV2JsonlTmMigration } from '../../../../src/core/tm/migrations/v1ToV2JsonlTmMigration'

function makeTmpDir(prefix = 'i18n-jsonl-migration-test-') {
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

describe('V1ToV2JsonlTmMigration', () => {
  let workspacePath: string

  beforeEach(() => {
    workspacePath = makeTmpDir()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(workspacePath, { recursive: true, force: true })
  })

  it('remaps structured numeric textPos to path textPos', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('greeting')
  })

  it('remaps structured numeric textPos for absolute source paths', () => {
    const sourceFile = join(workspacePath, 'src', 'absolute.json')
    mkdirSync(join(workspacePath, 'src'), { recursive: true })
    writeFileSync(sourceFile, '{"greeting":"Hello"}', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: sourceFile,
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('greeting')
  })

  it('keeps non-numeric structured entries during successful extraction', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      },
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 'intro',
        sourceText: 'Intro',
        context: '',
        targetText: 'Intro',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(2)
    expect(migrated.map((entry) => entry.textPos)).toEqual(['greeting', 'intro'])
  })

  it('migrates structured numeric textPos rows even when source text differs', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hi"}', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })
    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('greeting')
  })

  it('deletes legacy translation.db files during migration', () => {
    const translatorDir = join(workspacePath, '.translator')
    mkdirSync(translatorDir, { recursive: true })

    const legacyDb = join(translatorDir, 'translation.db')
    const legacyWal = `${legacyDb}-wal`
    const legacyShm = `${legacyDb}-shm`

    writeFileSync(legacyDb, 'legacy-db', 'utf8')
    writeFileSync(legacyWal, 'legacy-wal', 'utf8')
    writeFileSync(legacyShm, 'legacy-shm', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()
    const migrated = migration.migrate([], { workspacePath, logger })

    expect(migrated).toEqual([])
    expect(existsSync(legacyDb)).toBe(false)
    expect(existsSync(legacyWal)).toBe(false)
    expect(existsSync(legacyShm)).toBe(false)
  })

  it('preserves only path-only entries when a structured source file is missing', () => {
    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/missing.json',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      },
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/missing.json',
        textPos: 'intro',
        sourceText: 'Intro',
        context: '',
        targetText: 'Intro',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('intro')
  })

  it('leaves non-structured source files unchanged', () => {
    const sourceFile = join(workspacePath, 'src', 'messages.txt')
    mkdirSync(join(workspacePath, 'src'), { recursive: true })
    writeFileSync(sourceFile, 'plain text', 'utf8')

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.txt',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe(0)
  })

  it('drops numeric entries when a structured extraction has no matching path', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    vi.spyOn(extractorRegistry, 'extractForFile').mockReturnValue({
      kind: 'json',
      segments: ['Hello'],
      paths: [['greeting']],
      rebuild: () => '{}',
      makeContexts: () => [null]
    } as never)

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 1,
        sourceText: 'Hello again',
        context: '',
        targetText: 'Bonjour encore',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(0)
  })

  it('keeps path-only entries when structured extraction falls back to markdown or empty output', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'markdown.json'), '{"ignored":"value"}', 'utf8')
    writeFileSync(join(sourceDir, 'empty.json'), '{"ignored":"value"}', 'utf8')

    vi.spyOn(extractorRegistry, 'extractForFile')
      .mockReturnValueOnce({
        kind: 'markdown',
        segments: [],
        rebuild: () => '',
        contexts: []
      } as never)
      .mockReturnValueOnce({
        kind: 'json',
        segments: [],
        paths: [],
        rebuild: () => '',
        makeContexts: () => []
      } as never)

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/markdown.json',
        textPos: 'intro',
        sourceText: 'Intro',
        context: '',
        targetText: 'Intro',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      },
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/empty.json',
        textPos: 'summary',
        sourceText: 'Summary',
        context: '',
        targetText: 'Summary',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(2)
    expect(migrated.map((entry) => entry.textPos)).toEqual(['intro', 'summary'])
  })

  it('falls back cleanly when structured file reading fails', () => {
    const sourceDir = join(workspacePath, 'src')
    const sourcePath = join(sourceDir, 'broken.json')
    mkdirSync(sourcePath, { recursive: true })

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    const entries: TmEntry[] = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/broken.json',
        textPos: 'intro',
        sourceText: 'Intro',
        context: '',
        targetText: 'Intro',
        status: 'ai_draft',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('intro')
  })

  it('warns when a legacy SQLite file cannot be removed', () => {
    const translatorDir = join(workspacePath, '.translator')
    mkdirSync(translatorDir, { recursive: true })

    const legacyDb = join(translatorDir, 'translation.db')
    mkdirSync(legacyDb, { recursive: true })

    const migration = new V1ToV2JsonlTmMigration()
    const logger = createMockLogger()

    migration.migrate([], { workspacePath, logger })

    expect(logger.warn).toHaveBeenCalled()
  })
})
