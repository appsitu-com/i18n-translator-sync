import { TM_ORIGIN_DEFAULT, TM_STATUS_DEFAULT, type TmEntry } from '../jsonlTmTypes'
import type { IJsonlTmMigration, JsonlTmMigrationContext } from './JsonlTmMigrator'

export class V2ToV3JsonlTmMigration implements IJsonlTmMigration {
  readonly fromVersion = 2
  readonly toVersion = 3

  migrate(entries: TmEntry[], _context: JsonlTmMigrationContext): TmEntry[] {
    return entries.map((entry) => ({
      ...entry,
      status: this.normalizeStatus(entry.status),
      origin: this.normalizeOrigin(entry.origin)
    }))
  }

  private normalizeStatus(status: string): string {
    if (status === 'ai_draft') {
      return TM_STATUS_DEFAULT
    }

    return status || TM_STATUS_DEFAULT
  }

  private normalizeOrigin(origin: string): string {
    if (typeof origin === 'string' && origin.trim().length > 0) {
      return origin
    }

    return TM_ORIGIN_DEFAULT
  }
}