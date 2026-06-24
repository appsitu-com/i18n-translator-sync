import { describe, it, expect } from 'vitest'
import type { CacheEntry, JsonlLine } from '../../../src/core/tm/jsonlCacheTypes'

describe('jsonlCacheTypes', () => {
  it('defines a valid cache entry shape', () => {
    const entry: CacheEntry = {
      engine: 'google',
      source: 'en',
      target: 'fr',
      sourcePath: 'src/messages.json',
      textPos: 'greeting',
      sourceText: 'Hello',
      context: '',
      targetText: 'Bonjour',
      status: 'ai_draft',
      updatedAt: 1234
    }

    expect(entry.targetText).toBe('Bonjour')
    expect(entry.textPos).toBe('greeting')
  })

  it('defines a valid JSONL meta line shape', () => {
    const line: JsonlLine = { type: 'meta', schemaVersion: 2 }
    expect(line.type).toBe('meta')
  })

  it('defines a valid JSONL entry line shape', () => {
    const line: JsonlLine = {
      type: 'entry',
      engine: 'google',
      source: 'en',
      target: 'fr',
      sourcePath: 'src/messages.json',
      textPos: 0,
      sourceText: 'Hello',
      context: '',
      targetText: 'Bonjour',
      status: 'ai_draft',
      updatedAt: 1234
    }

    expect(line.type).toBe('entry')
    if (line.type === 'entry') {
      expect(line.sourceText).toBe('Hello')
    }
  })
})
