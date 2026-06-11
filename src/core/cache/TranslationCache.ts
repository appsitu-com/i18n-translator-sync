export type Pair = { src: string; dst: string; ctx?: string | null; pos?: number }

export interface TranslationCache {
  /**
   * Get multiple translations from the cache
   */
  getMany(params: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: number[]
  }): Promise<Map<string, { translation: string; textPos?: number }>>

  /**
   * Put multiple translations into the cache
   */
  putMany(params: {
    engine: string
    source: string
    target: string
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
   * Close the cache connection
   */
  close(): void
}

export { JsonlTranslationCache } from './jsonlTranslationCache.js'
