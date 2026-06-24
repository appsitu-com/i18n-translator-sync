export type Pair = { src: string; dst: string; ctx?: string | null; pos?: number | string }

export interface TranslationMemory {
  /**
   * Get multiple translations from the cache
   */
  getMany(params: {
    engine: string
    sourceLocale: string
    targetLocale: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: (number | string)[]
  }): Promise<Map<string, { translation: string; textPos?: number | string }>>

  /**
   * Put multiple translations into the cache
   */
  putMany(params: {
    engine: string
    sourceLocale: string
    targetLocale: string
    pairs: Pair[]
    sourcePath?: string
  }): Promise<void>

  /**
   * Export the cache to a CSV file
   */
  exportCSV(filePath: string): Promise<void>

  /**
   * Import translations from a CSV file
   */
  importCSV(filePath: string): Promise<number>

  /**
   * Check whether a source file path exists in the cache index
   */
  hasSourcePath(sourcePath: string): Promise<boolean>

  /**
   * Check whether purge mark phase is active (unused rows pending sweep)
   */
  hasPendingPurge(): Promise<boolean>

  /**
   * Mark all rows as unused before purge sweep.
   */
  purge(): Promise<{ deletedCount: number }>

  /**
   * Delete rows still marked unused after a purge mark/retranslate pass.
   */
  completePurge(): Promise<{ deletedCount: number }>

  /**
   * Check if this cache database was just created
   */
  isNew(): boolean

  /**
   * Check if a v1 => v2 migration was performed on this cache
   */
  didMigrateFromV1(): boolean

  /**
   * Clear the migration flag after handling the migration
   */
  clearMigrationFlag(): void

  /**
   * Close the cache connection
   */
  close(): void
}

export { JsonlTranslationMemory } from './jsonlTranslationMemory'
