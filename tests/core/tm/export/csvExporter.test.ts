import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { CsvExporter, type TmEntry } from '../../../../src/core/tm/export/csvExporter'
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

describe('CsvExporter', () => {
  it('exports CSV header and rows sorted by sourcePath, textPos, then target locale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'csv-exporter-test-'))

    try {
      const filePath = join(dir, 'tm.csv')
      const logger = createMockLogger()
      const exporter = new CsvExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'test',
          source: 'en',
          target: 'de',
          sourcePath: 'src/b.json',
          textPos: 2,
          sourceText: 'Bye',
          context: '',
          targetText: 'Tschuss',
          status: 'translated',
          origin: 'ai',
          updatedAt: 10
        },
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/a.json',
          textPos: 1,
          sourceText: 'Hello',
          context: '',
          targetText: 'Bonjour',
          status: 'translated',
          origin: 'ai',
          updatedAt: 20
        },
        {
          engine: 'test',
          source: 'en',
          target: 'es',
          sourcePath: 'src/a.json',
          textPos: 1,
          sourceText: 'Hello',
          context: '',
          targetText: 'Hola',
          status: 'translated',
          origin: 'ai',
          updatedAt: 30
        }
      ]

      exporter.export(filePath, entries)

      const content = readFileSync(filePath, 'utf8')
      expect(content).toContain('source_path,text_pos,engine_name,source_lang,target_lang,source_text,context,target_text,status,origin,updated_at')

      const rows = parse(content, {
        columns: true,
        skip_empty_lines: true
      }) as Array<{ source_path: string; text_pos: string; target_lang: string }>

      expect(rows).toHaveLength(3)
      expect(rows[0]).toMatchObject({ source_path: 'src/a.json', text_pos: '1', target_lang: 'es' })
      expect(rows[1]).toMatchObject({ source_path: 'src/a.json', text_pos: '1', target_lang: 'fr' })
      expect(rows[2]).toMatchObject({ source_path: 'src/b.json', text_pos: '2', target_lang: 'de' })
      expect(logger.info).toHaveBeenCalledWith(`Exported 3 translations to ${filePath}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sorts mixed string/number text positions lexicographically when needed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'csv-exporter-pos-test-'))

    try {
      const filePath = join(dir, 'tm.csv')
      const logger = createMockLogger()
      const exporter = new CsvExporter(logger)

      const entries: TmEntry[] = [
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/a.json',
          textPos: 'items[10].label',
          sourceText: 'Ten',
          context: '',
          targetText: 'Dix',
          status: 'translated',
          origin: 'ai',
          updatedAt: 1
        },
        {
          engine: 'test',
          source: 'en',
          target: 'fr',
          sourcePath: 'src/a.json',
          textPos: 'items[2].label',
          sourceText: 'Two',
          context: '',
          targetText: 'Deux',
          status: 'translated',
          origin: 'ai',
          updatedAt: 2
        }
      ]

      exporter.export(filePath, entries)

      const rows = parse(readFileSync(filePath, 'utf8'), {
        columns: true,
        skip_empty_lines: true
      }) as Array<{ text_pos: string }>

      expect(rows.map((row) => row.text_pos)).toEqual(['items[10].label', 'items[2].label'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
