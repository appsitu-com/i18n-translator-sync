import * as fs from 'fs'
import * as path from 'path'
import { TRANSLATOR_DIR } from '../../constants'
import { extractForFile, jsonPathToString } from '../../../extractors/extractorRegistry'
import type { CacheEntry } from '../jsonlCacheTypes'
import type { JsonlCacheMigration, JsonlCacheMigrationContext } from './jsonlCacheMigrator'

export class V1ToV2JsonlCacheMigration implements JsonlCacheMigration {
  readonly fromVersion = 1
  readonly toVersion = 2

  migrate(entries: CacheEntry[], context: JsonlCacheMigrationContext): CacheEntry[] {
    const migratedEntries = this.migrateStructuredTextPositions(entries, context.workspacePath)
    this.deleteLegacySqliteFiles(context)
    return migratedEntries
  }

  private migrateStructuredTextPositions(entries: CacheEntry[], workspacePath: string): CacheEntry[] {
    const migratedEntries: CacheEntry[] = []
    const bySourcePath = new Map<string, CacheEntry[]>()

    for (const entry of entries) {
      const group = bySourcePath.get(entry.sourcePath)
      if (group) {
        group.push(entry)
      } else {
        bySourcePath.set(entry.sourcePath, [entry])
      }
    }

    for (const [sourcePath, sourceEntries] of bySourcePath.entries()) {
      if (!this.isStructuredSourceFile(sourcePath)) {
        migratedEntries.push(...sourceEntries)
        continue
      }

      const absoluteSourcePath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.join(workspacePath, sourcePath)

      if (!fs.existsSync(absoluteSourcePath)) {
        this.pushOnlyPathEntries(sourceEntries, migratedEntries)
        continue
      }

      const extraction = this.tryExtractStructuredPaths(absoluteSourcePath)
      if (!extraction) {
        this.pushOnlyPathEntries(sourceEntries, migratedEntries)
        continue
      }

      const { extractedPaths, extractedSegments } = extraction
      for (const entry of sourceEntries) {
        if (typeof entry.textPos !== 'number') {
          migratedEntries.push(entry)
          continue
        }

        const index = entry.textPos
        const mappedPath = extractedPaths[index]
        if (!mappedPath) {
          continue
        }

        entry.textPos = mappedPath
        migratedEntries.push(entry)
      }
    }

    return migratedEntries
  }

  private tryExtractStructuredPaths(
    absoluteSourcePath: string
  ): { extractedPaths: string[]; extractedSegments: string[] } | undefined {
    try {
      const content = fs.readFileSync(absoluteSourcePath, 'utf8')
      const extraction = extractForFile(absoluteSourcePath, content)
      if (extraction.kind === 'markdown') {
        return undefined
      }

      const extractedPaths = extraction.paths.map(jsonPathToString)
      if (extractedPaths.length === 0) {
        return undefined
      }

      return {
        extractedPaths,
        extractedSegments: extraction.segments
      }
    } catch {
      return undefined
    }
  }

  private pushOnlyPathEntries(sourceEntries: CacheEntry[], migratedEntries: CacheEntry[]): void {
    for (const entry of sourceEntries) {
      if (typeof entry.textPos === 'number') {
        continue
      }
      migratedEntries.push(entry)
    }
  }

  private deleteLegacySqliteFiles(context: JsonlCacheMigrationContext): void {
    const legacyDbPath = path.join(context.workspacePath, TRANSLATOR_DIR, 'translation.db')
    const candidates = [
      legacyDbPath,
      `${legacyDbPath}-wal`,
      `${legacyDbPath}-shm`,
      `${legacyDbPath}-journal`
    ]

    let removedCount = 0

    for (const filePath of candidates) {
      if (!fs.existsSync(filePath)) {
        continue
      }

      try {
        fs.unlinkSync(filePath)
        removedCount++
      } catch (error) {
        context.logger.warn(`Failed to remove legacy cache file ${filePath}: ${String(error)}`)
      }
    }

    if (removedCount > 0) {
      context.logger.info(`Removed ${removedCount} legacy SQLite cache file(s) during JSONL migration`)
    }
  }

  private isStructuredSourceFile(sourcePath: string): boolean {
    const lowerPath = sourcePath.toLowerCase()
    return (
      lowerPath.endsWith('.json') ||
      lowerPath.endsWith('.yaml') ||
      lowerPath.endsWith('.yml') ||
      lowerPath.endsWith('.ts') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.mjs') ||
      lowerPath.endsWith('.cjs')
    )
  }
}