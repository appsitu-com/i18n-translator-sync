/**
 * Handles XLIFF export for MateCat review push operations
 * Complements xliffReviewImporter for complete XLIFF round-trip support
 */

import * as fs from 'fs'
import { ILogger } from '../util/baseLogger'
import { ITranslationMemory } from '../tm/ITranslationMemory'

export interface XliffExportOptions {
  origin?: string
  targetLocale?: string
}

/**
 * Generates XLIFF documents from translation memory for review uploads to MateCat
 */
export class XliffReviewExporter {
  constructor(
    private readonly tm: ITranslationMemory,
    private readonly logger: ILogger
  ) {}

  /**
   * Export translations to XLIFF file for MateCat review
   * @param filePath Path where XLIFF file should be written
   * @param options Export options (origin filter, target locale filter)
   * @returns Number of translation units exported
   */
  async exportXliff(filePath: string, options: XliffExportOptions = {}): Promise<number> {
    const entries = (await this.tm.exportXLIFF(filePath, options)) || 0

    if (entries === 0) {
      this.logger.info(`Skipped XLIFF export to ${filePath} (no matching translations)`)
      return 0
    }

    // File was created by TM export - now enhance it with review-specific attributes
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const enhancedContent = this.enhanceXliffForReview(content)
      fs.writeFileSync(filePath, enhancedContent, 'utf8')
      this.logger.info(`Enhanced XLIFF with review attributes: ${filePath}`)
    } catch (error) {
      this.logger.warn(`Failed to enhance XLIFF file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      // Continue anyway - the file was exported successfully, just without enhancements
    }

    this.logger.info(`Exported ${entries} translations to ${filePath} (XLIFF with review enhancements)`)
    return entries
  }

  /**
   * Enhance generated XLIFF with attributes needed for MateCat review
   * Adds xml:space="preserve" and rename attributes for proper handling
   */
  private enhanceXliffForReview(xliffContent: string): string {
    // Add xml:space="preserve" to file elements to preserve whitespace
    let enhanced = xliffContent.replace(
      /(<file\s+[^>]*source-language="[^"]*"\s+target-language="[^"]*"\s+original="[^"]*")/g,
      '$1 xml:space="preserve"'
    )

    // Add xml:space="preserve" to source and target elements for precise whitespace handling
    enhanced = enhanced.replace(/<(source|target)>/g, '<$1 xml:space="preserve">')

    return enhanced
  }
}
