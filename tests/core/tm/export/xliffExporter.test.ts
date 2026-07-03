import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { XliffExporter, type TmEntry } from '../../../../src/core/tm/export/xliffExporter'
import type { ILogger } from '../../../../src/core/util/baseLogger'

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

describe('XliffExporter', () => {
  it('skips export when there are no entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xliff-exporter-empty-'))

    try {
      const filePath = join(dir, 'empty.xlf')
      const logger = createMockLogger()
      const exporter = new XliffExporter(logger)

      const count = exporter.export(filePath, [])

      expect(count).toBe(0)
      expect(logger.info).toHaveBeenCalledWith(`Skipped XLIFF export to ${filePath} (no matching translations)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('groups entries by locale pair and source path, preserving xml:space attributes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xliff-exporter-group-'))

    try {
      const filePath = join(dir, 'review.xlf')
      const logger = createMockLogger()
      const exporter = new XliffExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'test',
          source: 'en-US',
          target: 'fr-FR',
          sourcePath: 'i18n/en/messages.json',
          textPos: 1,
          sourceText: 'Hello',
          context: 'greeting',
          targetText: 'Bonjour',
          status: 'translated',
          origin: 'ai',
          updatedAt: 1
        },
        {
          engine: 'test',
          source: 'en-US',
          target: 'fr-FR',
          sourcePath: 'i18n/en/messages.json',
          textPos: 2,
          sourceText: 'Bye',
          context: '',
          targetText: 'Au revoir',
          status: 'translated',
          origin: 'ai',
          updatedAt: 2
        },
        {
          engine: 'test',
          source: 'en-US',
          target: 'es-ES',
          sourcePath: 'i18n/en/messages.json',
          textPos: 3,
          sourceText: 'Hello',
          context: '',
          targetText: 'Hola',
          status: 'translated',
          origin: 'ai',
          updatedAt: 3
        }
      ]

      const count = exporter.export(filePath, entries)
      const xliff = readFileSync(filePath, 'utf8')

      expect(count).toBe(3)
      expect(xliff).toContain('<xliff version="1.2">')
      expect(xliff).toContain('source-language="en-US" target-language="fr-FR" original="i18n/en/messages.json" xml:space="preserve"')
      expect(xliff).toContain('source-language="en-US" target-language="es-ES" original="i18n/en/messages.json" xml:space="preserve"')
      expect(xliff).toContain('<source xml:space="preserve">Hello</source>')
      expect(xliff).toContain('<target xml:space="preserve">Bonjour</target>')
      expect(xliff).toContain('<trans-unit id="greeting">')
      expect(logger.info).toHaveBeenCalledWith(`Exported 3 translations to ${filePath} (XLIFF)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('escapes XML in text and uses textPos/index fallback for trans-unit ids', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xliff-exporter-escape-'))

    try {
      const filePath = join(dir, 'escaped.xlf')
      const logger = createMockLogger()
      const exporter = new XliffExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'i18n/en/messages.json',
          textPos: 'items[0].name',
          sourceText: 'Fish & Chips <tag>',
          context: '',
          targetText: 'Poisson & Frites "ok"',
          status: 'translated',
          origin: 'ai',
          updatedAt: 1
        }
      ]

      exporter.export(filePath, entries)
      const xliff = readFileSync(filePath, 'utf8')

      expect(xliff).toContain('<trans-unit id="items[0].name">')
      expect(xliff).toContain('Fish &amp; Chips &lt;tag&gt;')
      expect(xliff).toContain('Poisson &amp; Frites &quot;ok&quot;')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
