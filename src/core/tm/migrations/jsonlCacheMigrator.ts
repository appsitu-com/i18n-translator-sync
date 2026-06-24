import type { Logger } from '../../util/baseLogger'
import type { CacheEntry } from '../jsonlCacheTypes'

export type JsonlCacheMigrationContext = {
  workspacePath: string
  logger: Logger
}

export interface JsonlCacheMigration {
  readonly fromVersion: number
  readonly toVersion: number
  migrate(entries: CacheEntry[], context: JsonlCacheMigrationContext): CacheEntry[]
}

export type JsonlCacheMigrationResult = {
  entries: CacheEntry[]
  didMigrate: boolean
  finalVersion: number
}

export class JsonlCacheMigrator {
  private readonly migrationByFromVersion = new Map<number, JsonlCacheMigration>()

  constructor(migrations: JsonlCacheMigration[]) {
    for (const migration of migrations) {
      this.migrationByFromVersion.set(migration.fromVersion, migration)
    }
  }

  run({
    entries,
    schemaVersion,
    targetVersion,
    context
  }: {
    entries: CacheEntry[]
    schemaVersion: number
    targetVersion: number
    context: JsonlCacheMigrationContext
  }): JsonlCacheMigrationResult {
    if (schemaVersion >= targetVersion) {
      return {
        entries,
        didMigrate: false,
        finalVersion: schemaVersion
      }
    }

    let currentVersion = schemaVersion
    let nextEntries = entries
    let didMigrate = false

    while (currentVersion < targetVersion) {
      const migration = this.migrationByFromVersion.get(currentVersion)
      if (!migration) {
        context.logger.warn(
          `No JSONL cache migration found for schema v${currentVersion}; keeping existing entries as-is`
        )
        break
      }

      nextEntries = migration.migrate(nextEntries, context)
      currentVersion = migration.toVersion
      didMigrate = true
    }

    return {
      entries: nextEntries,
      didMigrate,
      finalVersion: currentVersion
    }
  }
}