import type { Logger } from '../../util/baseLogger'
import type { TmEntry } from '../jsonlTmTypes'

export type JsonlTmMigrationContext = {
  workspacePath: string
  logger: Logger
}

export interface JsonlTmMigration {
  readonly fromVersion: number
  readonly toVersion: number
  migrate(entries: TmEntry[], context: JsonlTmMigrationContext): TmEntry[]
}

export type JsonlTmMigrationResult = {
  entries: TmEntry[]
  didMigrate: boolean
  finalVersion: number
}

export class JsonlTmMigrator {
  private readonly migrationByFromVersion = new Map<number, JsonlTmMigration>()

  constructor(migrations: JsonlTmMigration[]) {
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
    entries: TmEntry[]
    schemaVersion: number
    targetVersion: number
    context: JsonlTmMigrationContext
  }): JsonlTmMigrationResult {
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
          `No JSONL TM migration found for schema v${currentVersion}; keeping existing entries as-is`
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