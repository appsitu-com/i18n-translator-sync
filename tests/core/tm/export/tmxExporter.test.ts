import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TmxExporter, type TmEntry } from '../../../../src/core/tm/export/tmxExporter'
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

describe('TmxExporter', () => {
  it('skips export when there are no entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmx-exporter-empty-'))

    try {
      const filePath = join(dir, 'empty.tmx')
      const logger = createMockLogger()
      const exporter = new TmxExporter(logger)

      const count = exporter.export(filePath, [])

      expect(count).toBe(0)
      expect(logger.info).toHaveBeenCalledWith(`Skipped TMX export to ${filePath} (no matching translations)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('escapes XML entities and writes TMX with source language header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmx-exporter-xml-'))

    try {
      const filePath = join(dir, 'tmx.xml')
      const logger = createMockLogger()
      const exporter = new TmxExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'matecat',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/messages.json',
          textPos: 0,
          sourceText: 'Fish & Chips <tag>',
          context: '',
          targetText: 'Poisson & Frites "ok"',
          status: 'reviewed',
          origin: 'human',
          updatedAt: 12345
        }
      ]

      const count = exporter.export(filePath, entries)
      const tmx = readFileSync(filePath, 'utf8')

      expect(count).toBe(1)
      expect(tmx).toContain('<tmx version="1.4">')
      expect(tmx).toContain('srclang="en"')
      expect(tmx).toContain('Fish &amp; Chips &lt;tag&gt;')
      expect(tmx).toContain('Poisson &amp; Frites &quot;ok&quot;')
      expect(logger.info).toHaveBeenCalledWith(`Exported 1 translations to ${filePath} (TMX)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sorts entries by source, target, sourcePath, and textPos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmx-exporter-sort-'))

    try {
      const filePath = join(dir, 'sorted.tmx')
      const logger = createMockLogger()
      const exporter = new TmxExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'test',
          source: 'fr',
          target: 'en',
          sourcePath: 'src/b.json',
          textPos: 2,
          sourceText: 'B',
          context: '',
          targetText: 'B-en',
          status: 'translated',
          origin: 'ai',
          updatedAt: 1
        },
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/a.json',
          textPos: 1,
          sourceText: 'A1',
          context: '',
          targetText: 'A1-fr',
          status: 'translated',
          origin: 'ai',
          updatedAt: 2
        },
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/a.json',
          textPos: 3,
          sourceText: 'A3',
          context: '',
          targetText: 'A3-fr',
          status: 'translated',
          origin: 'ai',
          updatedAt: 3
        }
      ]

      exporter.export(filePath, entries)
      const tmx = readFileSync(filePath, 'utf8')

      const a1 = tmx.indexOf('<seg>A1</seg>')
      const a3 = tmx.indexOf('<seg>A3</seg>')
      const b = tmx.indexOf('<seg>B</seg>')

      expect(a1).toBeGreaterThan(-1)
      expect(a3).toBeGreaterThan(-1)
      expect(b).toBeGreaterThan(-1)
      expect(a1).toBeLessThan(a3)
      expect(a3).toBeLessThan(b)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
