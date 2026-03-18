import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pickEngine } from '../../src/translators/registry'

function loadCsvColumnSet(filePath: string, columnName: string): Set<string> {
  const lines = readFileSync(filePath, 'utf8').trim().split(/\r?\n/)
  const headers = lines[0].split(',').map(header => header.trim())
  const columnIndex = headers.indexOf(columnName)

  if (columnIndex < 0) {
    throw new Error(`CSV column '${columnName}' was not found in ${filePath}`)
  }

  const values = new Set<string>()
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue
    }
    const columns = line.split(',')
    const value = columns[columnIndex]?.trim().toLowerCase()
    if (value) {
      values.add(value)
    }
  }

  return values
}

function loadNllbBaseLanguageCodes(filePath: string): Set<string> {
  const nllbScriptCodes = loadCsvColumnSet(filePath, 'language_code')
  return new Set([...nllbScriptCodes].map(scriptCode => scriptCode.split('_')[0]))
}

describe('translators/auto', () => {
  it('should resolve auto default to deepl for supported european targets', () => {
    const result = pickEngine({
      source: 'en-US',
      target: 'fr-FR',
      defaults: { md: 'auto', json: 'google' },
      overrides: {},
      fileType: 'md'
    })

    expect(result).toBe('deepl')
  })

  it('should resolve auto override using locale language codes', () => {
    const result = pickEngine({
      source: 'en_US',
      target: 'ja-JP',
      defaults: { md: 'azure', json: 'azure' },
      overrides: { 'en_US:ja-JP': 'auto' },
      fileType: 'json'
    })

    expect(result).toBe('google')
  })

  it('should route auto fallback to azure for markdown and google for structured files', () => {
    const markdownResult = pickEngine({
      source: 'en',
      target: 'sv',
      defaults: { md: 'auto', json: 'auto' },
      overrides: {},
      fileType: 'md'
    })

    const structuredResult = pickEngine({
      source: 'en',
      target: 'sv',
      defaults: { md: 'auto', json: 'auto' },
      overrides: {},
      fileType: 'json'
    })

    expect(markdownResult).toBe('azure')
    expect(structuredResult).toBe('google')
  })

  it('should route auto to nllb when target is unsupported by both azure and google but supported by nllb', () => {
    const result = pickEngine({
      source: 'en',
      target: 'kab',
      defaults: { md: 'auto', json: 'auto' },
      overrides: {},
      fileType: 'json'
    })

    expect(result).toBe('nllb')
  })

  it('should throw when target is unsupported by azure, google, and nllb', () => {
    expect(() =>
      pickEngine({
        source: 'en',
        target: 'kar',
        defaults: { md: 'auto', json: 'auto' },
        overrides: {},
        fileType: 'json'
      })
    ).toThrow("Auto engine routing could not find support for target locale 'kar'")
  })

  it('should fallback to azure for json when google does not support the target locale', () => {
    const result = pickEngine({
      source: 'en',
      target: 'ikt',
      defaults: { md: 'auto', json: 'auto' },
      overrides: {},
      fileType: 'json'
    })

    expect(result).toBe('azure')
  })

  it('should fallback to google for markdown when azure does not support the target locale', () => {
    const result = pickEngine({
      source: 'en',
      target: 'ace',
      defaults: { md: 'auto', json: 'auto' },
      overrides: {},
      fileType: 'md'
    })

    expect(result).toBe('google')
  })

  it('should route all nllb base locale codes to nllb when unsupported by azure and google', () => {
    const translatorsDir = path.join(process.cwd(), 'src', 'translators')
    const azureTargetCodes = loadCsvColumnSet(path.join(translatorsDir, 'azure.csv'), 'language_code')
    const googleTargetCodes = loadCsvColumnSet(path.join(translatorsDir, 'google.csv'), 'language_code')
    const nllbBaseCodes = loadNllbBaseLanguageCodes(path.join(translatorsDir, 'nllb.csv'))

    const nllbOnlyBaseCodes = [...nllbBaseCodes].filter(
      code => !azureTargetCodes.has(code) && !googleTargetCodes.has(code)
    )

    expect(nllbOnlyBaseCodes.length).toBeGreaterThan(0)

    for (const code of nllbOnlyBaseCodes) {
      const markdownResult = pickEngine({
        source: 'en',
        target: code,
        defaults: { md: 'auto', json: 'auto' },
        overrides: {},
        fileType: 'md'
      })

      const structuredResult = pickEngine({
        source: 'en',
        target: code,
        defaults: { md: 'auto', json: 'auto' },
        overrides: {},
        fileType: 'json'
      })

      expect(markdownResult).toBe('nllb')
      expect(structuredResult).toBe('nllb')
    }
  })
})
