/**
 * CSV export functionality for translation memory
 */

import * as fs from 'fs'
import { stringify } from 'csv-stringify/sync'
import { ILogger } from '../../util/baseLogger'

export interface TmEntry {
  engine: string
  source: string
  target: string
  sourcePath: string
  textPos: number | string
  sourceText: string
  context: string
  targetText: string
  status: string
  origin: string
  updatedAt: number
}

export class CsvExporter {
  constructor(private readonly logger: ILogger) {}

  /**
   * Export translation memory entries to CSV format
   */
  export(filePath: string, entries: TmEntry[]): void {
    const rows = entries
      .sort((a, b) => {
        if (a.sourcePath !== b.sourcePath) {
          return a.sourcePath.localeCompare(b.sourcePath)
        }
        if (a.textPos !== b.textPos) {
          return this.compareTextPos(a.textPos, b.textPos)
        }
        return a.target.localeCompare(b.target)
      })
      .map((entry) => ({
        source_path: entry.sourcePath,
        text_pos: entry.textPos,
        engine_name: entry.engine,
        source_lang: entry.source,
        target_lang: entry.target,
        source_text: entry.sourceText,
        context: entry.context,
        target_text: entry.targetText,
        status: entry.status,
        origin: entry.origin,
        updated_at: entry.updatedAt
      }))

    const csvContent = stringify(rows, {
      header: true,
      columns: [
        'source_path',
        'text_pos',
        'engine_name',
        'source_lang',
        'target_lang',
        'source_text',
        'context',
        'target_text',
        'status',
        'origin',
        'updated_at'
      ]
    })

    fs.writeFileSync(filePath, csvContent, 'utf8')
    this.logger.info(`Exported ${rows.length} translations to ${filePath}`)
  }

  private compareTextPos(left: number | string, right: number | string): number {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }

    return String(left).localeCompare(String(right))
  }
}
