import { describe, it, expect, vi } from 'vitest'
import type { Logger } from '../../../../src/core/util/baseLogger'
import type { TmEntry } from '../../../../src/core/tm/jsonlTmTypes'
import {
  JsonlTmMigrator,
  type JsonlTmMigration,
  type JsonlTmMigrationContext
} from '../../../../src/core/tm/migrations/jsonlTmMigrator'

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

function createContext(logger: Logger): JsonlTmMigrationContext {
  return {
    workspacePath: '/workspace',
    logger
  }
}

describe('JsonlTmMigrator', () => {
  it('returns input entries unchanged when already at target version', () => {
    const migrator = new JsonlTmMigrator([])
    const logger = createMockLogger()
    const entries: TmEntry[] = [
      {
        engine: 'google',
        source: 'en',
        target: 'fr',
        sourcePath: 'src/messages.json',
        textPos: 'greeting',
        sourceText: 'Hello',
        context: '',
        targetText: 'Bonjour',
        status: 'ai_draft',
        updatedAt: 1
      }
    ]

    const result = migrator.run({
      entries,
      schemaVersion: 2,
      targetVersion: 2,
      context: createContext(logger)
    })

    expect(result.entries).toBe(entries)
    expect(result.didMigrate).toBe(false)
    expect(result.finalVersion).toBe(2)
  })

  it('runs chained migrations in order', () => {
    const migration1: JsonlTmMigration = {
      fromVersion: 1,
      toVersion: 2,
      migrate(currentEntries) {
        return currentEntries.map((entry) => ({ ...entry, status: 'migrated-v2' }))
      }
    }

    const migration2: JsonlTmMigration = {
      fromVersion: 2,
      toVersion: 3,
      migrate(currentEntries) {
        return currentEntries.map((entry) => ({ ...entry, context: 'migrated-v3' }))
      }
    }

    const migrator = new JsonlTmMigrator([migration1, migration2])
    const logger = createMockLogger()

    const result = migrator.run({
      entries: [
        {
          engine: 'google',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/messages.json',
          textPos: 0,
          sourceText: 'Hello',
          context: '',
          targetText: 'Bonjour',
          status: 'ai_draft',
          updatedAt: 1
        }
      ],
      schemaVersion: 1,
      targetVersion: 3,
      context: createContext(logger)
    })

    expect(result.didMigrate).toBe(true)
    expect(result.finalVersion).toBe(3)
    expect(result.entries[0]?.status).toBe('migrated-v2')
    expect(result.entries[0]?.context).toBe('migrated-v3')
  })

  it('logs a warning and stops when a migration step is missing', () => {
    const logger = createMockLogger()
    const migrator = new JsonlTmMigrator([
      {
        fromVersion: 1,
        toVersion: 2,
        migrate(entries) {
          return entries
        }
      }
    ])

    const result = migrator.run({
      entries: [],
      schemaVersion: 1,
      targetVersion: 3,
      context: createContext(logger)
    })

    expect(result.didMigrate).toBe(true)
    expect(result.finalVersion).toBe(2)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})
