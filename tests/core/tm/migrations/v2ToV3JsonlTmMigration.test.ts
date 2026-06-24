import { describe, it, expect } from 'vitest'
import type { Logger } from '../../../../src/core/util/baseLogger'
import type { TmEntry } from '../../../../src/core/tm/jsonlTmTypes'
import { V2ToV3JsonlTmMigration } from '../../../../src/core/tm/migrations/v2ToV3JsonlTmMigration'

function createMockLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    appendLine: () => undefined,
    show: () => undefined
  }
}

describe('V2ToV3JsonlTmMigration', () => {
  it('normalizes ai_draft entries to initial status with ai origin', () => {
    const migration = new V2ToV3JsonlTmMigration()
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

    const migrated = migration.migrate(entries, { workspacePath: '/workspace', logger: createMockLogger() })

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.status).toBe('initial')
    expect(migrated[0]?.origin).toBe('ai')
  })

  it('backfills missing origin while preserving non-ai statuses', () => {
    const migration = new V2ToV3JsonlTmMigration()
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
        status: 'reviewed',
        origin: '',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath: '/workspace', logger: createMockLogger() })

    expect(migrated[0]?.status).toBe('reviewed')
    expect(migrated[0]?.origin).toBe('ai')
  })

  it('defaults empty status to initial during migration', () => {
    const migration = new V2ToV3JsonlTmMigration()
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
        status: '',
        origin: 'ai',
        updatedAt: 1234
      }
    ]

    const migrated = migration.migrate(entries, { workspacePath: '/workspace', logger: createMockLogger() })

    expect(migrated[0]?.status).toBe('initial')
    expect(migrated[0]?.origin).toBe('ai')
  })

  it('defaults non-string origin and status values during migration', () => {
    const migration = new V2ToV3JsonlTmMigration()
    const entries = [
      {
        engine: 'test',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 0,
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: undefined,
        origin: undefined,
        updatedAt: 1234
      }
    ] as unknown as TmEntry[]

    const migrated = migration.migrate(entries, { workspacePath: '/workspace', logger: createMockLogger() })

    expect(migrated[0]?.status).toBe('initial')
    expect(migrated[0]?.origin).toBe('ai')
  })
})