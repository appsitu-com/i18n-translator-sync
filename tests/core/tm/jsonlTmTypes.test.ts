import { describe, it, expect } from 'vitest'
import { TM_ORIGIN_DEFAULT, TM_STATUS_DEFAULT, type TmEntry, type JsonlTmLine } from '../../../src/core/tm/jsonlTmTypes'

describe('jsonlTmTypes', () => {
  it('defines a valid cache entry shape', () => {
    const entry: TmEntry = {
      engine: 'google',
      source: 'en',
      target: 'fr',
      sourcePath: 'src/messages.json',
      textPos: 'greeting',
      sourceText: 'Hello',
      context: '',
      targetText: 'Bonjour',
      status: TM_STATUS_DEFAULT,
      origin: TM_ORIGIN_DEFAULT,
      updatedAt: 1234
    }

    expect(entry.targetText).toBe('Bonjour')
    expect(entry.textPos).toBe('greeting')
  })

  it('defines a valid JSONL meta line shape', () => {
    const line: JsonlTmLine = { type: 'meta', schemaVersion: 3 }
    expect(line.type).toBe('meta')
  })

  it('defines a valid JSONL entry line shape', () => {
    const line: JsonlTmLine = {
      type: 'entry',
      engine: 'google',
      source: 'en',
      target: 'fr',
      sourcePath: 'src/messages.json',
      textPos: 0,
      sourceText: 'Hello',
      context: '',
      targetText: 'Bonjour',
      status: TM_STATUS_DEFAULT,
      origin: TM_ORIGIN_DEFAULT,
      updatedAt: 1234
    }

    expect(line.type).toBe('entry')
    if (line.type === 'entry') {
      expect(line.sourceText).toBe('Hello')
    }
  })
})
