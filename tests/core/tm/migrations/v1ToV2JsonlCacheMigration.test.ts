import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '../../../../src/core/util/baseLogger'
import type { CacheEntry } from '../../../../src/core/tm/jsonlCacheTypes'
import { V1ToV2JsonlCacheMigration } from '../../../../src/core/tm/migrations/v1ToV2JsonlCacheMigration'

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

describe('V1ToV2JsonlCacheMigration', () => {
  let workspacePath: string

  beforeEach(() => {
    workspacePath = makeTmpDir()
  })

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true })
  })

  it('remaps structured numeric textPos to path textPos', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hello"}', 'utf8')

    const migration = new V1ToV2JsonlCacheMigration()
    const logger = createMockLogger()

    const entries: CacheEntry[] = [
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
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath, logger })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.textPos).toBe('greeting')
  })

  it('migrates structured numeric textPos rows even when source text differs', () => {
    const sourceDir = join(workspacePath, 'src')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'messages.json'), '{"greeting":"Hi"}', 'utf8')

    const migration = new V1ToV2JsonlCacheMigration()
    const logger = createMockLogger()

    const entries: CacheEntry[] = [
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

    const migration = new V1ToV2JsonlCacheMigration()
    const logger = createMockLogger()
    const migrated = migration.migrate([], { workspacePath, logger })

    expect(migrated).toEqual([])
    expect(existsSync(legacyDb)).toBe(false)
    expect(existsSync(legacyWal)).toBe(false)
    expect(existsSync(legacyShm)).toBe(false)
  })
})
