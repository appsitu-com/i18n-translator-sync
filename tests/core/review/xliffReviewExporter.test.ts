import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { XliffReviewExporter } from '../../../src/core/review/xliffReviewExporter'
import type { ITranslationMemory } from '../../../src/core/tm/ITranslationMemory'
import type { ILogger } from '../../../src/core/util/baseLogger'

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

const BASE_XLIFF = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`

describe('XliffReviewExporter', () => {
  let workspacePath = ''
  let logger: ILogger
  let exportXLIFF: ReturnType<typeof vi.fn>
  let tm: ITranslationMemory

  beforeEach(() => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'xliff-review-exporter-'))
    logger = createLogger()
    exportXLIFF = vi.fn()
    tm = {
      exportXLIFF
    } as unknown as ITranslationMemory
  })

  afterEach(() => {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })

  it('skips file enhancement when no entries are exported', async () => {
    const outputPath = path.join(workspacePath, 'review.xliff')
    exportXLIFF.mockResolvedValueOnce(0)

    const exporter = new XliffReviewExporter(tm, logger)
    const count = await exporter.exportXliff(outputPath, { origin: 'review' })

    expect(count).toBe(0)
    expect(exportXLIFF).toHaveBeenCalledWith(outputPath, { origin: 'review' })
    expect(logger.info).toHaveBeenCalledWith(
      `Skipped XLIFF export to ${outputPath} (no matching translations)`
    )
  })

  it('enhances exported XLIFF with xml:space preserve attributes', async () => {
    const outputPath = path.join(workspacePath, 'review.xliff')

    exportXLIFF.mockImplementationOnce(async (filePath: string) => {
      writeFileSync(filePath, BASE_XLIFF, 'utf8')
      return 1
    })

    const exporter = new XliffReviewExporter(tm, logger)
    const count = await exporter.exportXliff(outputPath, { targetLocale: 'fr' })

    const enhanced = readFileSync(outputPath, 'utf8')

    expect(count).toBe(1)
    expect(exportXLIFF).toHaveBeenCalledWith(outputPath, { targetLocale: 'fr' })
    expect(enhanced).toContain('<file source-language="en" target-language="fr" original="i18n/fr/messages.json" xml:space="preserve">')
    expect(enhanced).toContain('<source xml:space="preserve">Hello</source>')
    expect(enhanced).toContain('<target xml:space="preserve">Bonjour</target>')
    expect(logger.info).toHaveBeenCalledWith(`Enhanced XLIFF with review attributes: ${outputPath}`)
    expect(logger.info).toHaveBeenCalledWith(
      `Exported 1 translations to ${outputPath} (XLIFF with review enhancements)`
    )
  })

  it('returns exported count even when enhancement fails', async () => {
    const outputPath = path.join(workspacePath, 'missing-file.xliff')
    exportXLIFF.mockResolvedValueOnce(2)

    const exporter = new XliffReviewExporter(tm, logger)
    const count = await exporter.exportXliff(outputPath)

    expect(count).toBe(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to enhance XLIFF file at ${outputPath}:`)
    )
    expect(logger.info).toHaveBeenCalledWith(
      `Exported 2 translations to ${outputPath} (XLIFF with review enhancements)`
    )
  })
})