import { describe, it, expect } from 'vitest'
import { extractJSON, jsonPathToString } from '../../src/extractors/json'

// JSON extraction tests
describe('extractJSON', () => {
  it('extracts strings from nested JSON objects and arrays', () => {
    const json = JSON.stringify(
      {
        a: 'hello',
        b: { c: 'world', d: ['foo', 'bar'] },
        e: 42,
        f: { g: { h: 'baz' } }
      },
      null,
      2
    )
    const ex = extractJSON(json)
    expect(ex.kind).toBe('json')
    expect(ex.segments).toEqual(['hello', 'world', 'foo', 'bar', 'baz'])
    if (ex.kind === 'json') {
      expect(ex.paths.map(jsonPathToString)).toEqual(['a', 'b.c', 'b.d[0]', 'b.d[1]', 'f.g.h'])
    }
    // Test rebuild
    const rebuilt = ex.rebuild(['A', 'B', 'C', 'D', 'E'])
    expect(JSON.parse(rebuilt)).toEqual({
      a: 'A',
      b: { c: 'B', d: ['C', 'D'] },
      e: 42,
      f: { g: { h: 'E' } }
    })
  })

  it('returns empty segments for JSON with no strings', () => {
    const json = JSON.stringify({ a: 1, b: true, c: null, d: [] }, null, 2)
    const ex = extractJSON(json)
    expect(ex.segments).toEqual([])
    if (ex.kind === 'json') {
      expect(ex.paths).toEqual([])
    }
  })
})

describe('extractJSON key exclusion', () => {
  it('excludes keys by name at any depth', () => {
    const json = JSON.stringify({
      id: 'skip-me',
      greeting: 'Hello',
      nested: { id: 'skip-nested', label: 'Label' }
    }, null, 2)
    const ex = extractJSON(json, { excludeKeys: ['id'] })
    expect(ex.segments).toEqual(['Hello', 'Label'])
  })

  it('excludes by exact dotted key path', () => {
    const json = JSON.stringify({
      meta: { version: '1.0', label: 'Meta Label' },
      greeting: 'Hello'
    }, null, 2)
    const ex = extractJSON(json, { excludeKeyPaths: ['meta.version'] })
    expect(ex.segments).toEqual(['Meta Label', 'Hello'])
  })

  it('preserves excluded values in rebuild', () => {
    const json = JSON.stringify({
      id: 'keep-this',
      greeting: 'Hello',
      farewell: 'Goodbye'
    }, null, 2)
    const ex = extractJSON(json, { excludeKeys: ['id'] })
    expect(ex.segments).toEqual(['Hello', 'Goodbye'])
    const rebuilt = JSON.parse(ex.rebuild(['Hola', 'Adiós']))
    expect(rebuilt.id).toBe('keep-this')
    expect(rebuilt.greeting).toBe('Hola')
    expect(rebuilt.farewell).toBe('Adiós')
  })

  it('preserves excluded subtree in rebuild', () => {
    const json = JSON.stringify({
      meta: { version: '1.0', author: 'Test' },
      greeting: 'Hello'
    }, null, 2)
    const ex = extractJSON(json, { excludeKeys: ['meta'] })
    expect(ex.segments).toEqual(['Hello'])
    const rebuilt = JSON.parse(ex.rebuild(['Hola']))
    expect(rebuilt.meta).toEqual({ version: '1.0', author: 'Test' })
    expect(rebuilt.greeting).toBe('Hola')
  })

  it('preserves excluded path value in rebuild', () => {
    const json = JSON.stringify({
      meta: { version: '1.0', label: 'Meta Label' },
      greeting: 'Hello'
    }, null, 2)
    const ex = extractJSON(json, { excludeKeyPaths: ['meta.version'] })
    expect(ex.segments).toEqual(['Meta Label', 'Hello'])
    const rebuilt = JSON.parse(ex.rebuild(['Étiquette', 'Bonjour']))
    expect(rebuilt.meta.version).toBe('1.0')
    expect(rebuilt.meta.label).toBe('Étiquette')
    expect(rebuilt.greeting).toBe('Bonjour')
  })
})
