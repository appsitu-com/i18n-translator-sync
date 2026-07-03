/**
 * TMX export functionality for translation memory
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

export class TmxExporter {
  constructor(private readonly logger: ILogger) {}

  /**
   * Export translation memory entries to TMX (Translation Memory eXchange) format
   */
  export(filePath: string, entries: TmEntry[], sourceLocale?: string): number {
    if (entries.length === 0) {
      this.logger.info(`Skipped TMX export to ${filePath} (no matching translations)`)
      return 0
    }

    const sortedEntries = this.sortEntries(entries)

    const tuRows = sortedEntries.map((entry) => {
      const sourceLang = escapeXml(entry.source)
      const targetLang = escapeXml(entry.target)
      const sourceText = escapeXml(entry.sourceText)
      const targetText = escapeXml(entry.targetText)

      return [
        '    <tu>',
        `      <tuv xml:lang="${sourceLang}"><seg>${sourceText}</seg></tuv>`,
        `      <tuv xml:lang="${targetLang}"><seg>${targetText}</seg></tuv>`,
        '    </tu>'
      ].join('\n')
    })

    const firstSourceLang = escapeXml(sourceLocale || sortedEntries[0]?.source || 'en')
    const tmxContent = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tmx version="1.4">',
      `  <header creationtool="i18n-translator-sync" creationtoolversion="0.12.0" segtype="sentence" adminlang="en" srclang="${firstSourceLang}" datatype="PlainText"/>`,
      '  <body>',
      tuRows.join('\n'),
      '  </body>',
      '</tmx>',
      ''
    ].join('\n')

    fs.writeFileSync(filePath, tmxContent, 'utf8')
    this.logger.info(`Exported ${entries.length} translations to ${filePath} (TMX)`)
    return entries.length
  }

  private sortEntries(entries: TmEntry[]): TmEntry[] {
    return entries.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source.localeCompare(b.source)
      }
      if (a.target !== b.target) {
        return a.target.localeCompare(b.target)
      }
      if (a.sourcePath !== b.sourcePath) {
        return a.sourcePath.localeCompare(b.sourcePath)
      }
      return this.compareTextPos(a.textPos, b.textPos)
    })
  }

  private compareTextPos(left: number | string, right: number | string): number {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }

    return String(left).localeCompare(String(right))
  }
}
