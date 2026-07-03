/**
 * XLIFF export functionality for translation memory review operations
 */

import * as fs from 'fs'
import { ILogger } from '../../util/baseLogger'
import { escapeXml } from './xmlUtils'

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

export class XliffExporter {
  constructor(private readonly logger: ILogger) {}

  /**
   * Export translation memory entries to XLIFF (XML Localisation Interchange File Format)
   * Groups entries by source file and locale pair
   */
  export(filePath: string, entries: TmEntry[]): number {
    if (entries.length === 0) {
      this.logger.info(`Skipped XLIFF export to ${filePath} (no matching translations)`)
      return 0
    }

    const groupedByFile = this.groupByFile(entries)
    const fileBlocks = this.buildFileBlocks(groupedByFile)

    const xliffContent = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xliff version="1.2">',
      fileBlocks.join('\n'),
      '</xliff>',
      ''
    ].join('\n')

    fs.writeFileSync(filePath, xliffContent, 'utf8')
    this.logger.info(`Exported ${entries.length} translations to ${filePath} (XLIFF)`)
    return entries.length
  }

  private groupByFile(entries: TmEntry[]): Map<string, TmEntry[]> {
    const groupedByFile = new Map<string, TmEntry[]>()

    for (const entry of entries) {
      const fileKey = `${entry.source}\u0000${entry.target}\u0000${entry.sourcePath || 'translation-memory'}`
      const group = groupedByFile.get(fileKey)
      if (group) {
        group.push(entry)
      } else {
        groupedByFile.set(fileKey, [entry])
      }
    }

    return groupedByFile
  }

  private buildFileBlocks(groupedByFile: Map<string, TmEntry[]>): string[] {
    return Array.from(groupedByFile.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fileKey, fileEntries]) => {
        const [sourceLocale, targetLocale, sourcePath] = fileKey.split('\u0000')

        fileEntries.sort((left, right) => this.compareTextPos(left.textPos, right.textPos))

        const transUnits = fileEntries
          .map((entry, index) => {
            const unitId = escapeXml((entry.context || String(entry.textPos || index + 1)).trim() || String(index + 1))
            const sourceText = escapeXml(entry.sourceText)
            const targetText = escapeXml(entry.targetText)

            return [
              `      <trans-unit id="${unitId}">`,
              `        <source xml:space="preserve">${sourceText}</source>`,
              `        <target xml:space="preserve">${targetText}</target>`,
              '      </trans-unit>'
            ].join('\n')
          })
          .join('\n')

        return [
          `  <file source-language="${escapeXml(sourceLocale)}" target-language="${escapeXml(targetLocale)}" original="${escapeXml(sourcePath)}" xml:space="preserve">`,
          '    <body>',
          transUnits,
          '    </body>',
          '  </file>'
        ].join('\n')
      })
  }

  private compareTextPos(left: number | string, right: number | string): number {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }

    return String(left).localeCompare(String(right))
  }
}
