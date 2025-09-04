import { describe, it, expect } from 'vitest'
import { extractJSON_valuesOnly, jsonPathToString } from '../../src/extractors/json'

// JSON extraction tests
describe('extractJSON_valuesOnly', () => {
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
    const ex = extractJSON_valuesOnly(json)
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
    const ex = extractJSON_valuesOnly(json)
    expect(ex.segments).toEqual([])
    if (ex.kind === 'json') {
      expect(ex.paths).toEqual([])
    }
  })
})

// JSON extraction tests
describe('extractJSON_valuesOnly', () => {
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
    const ex = extractJSON_valuesOnly(json)
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
    const ex = extractJSON_valuesOnly(json)
    expect(ex.segments).toEqual([])
    if (ex.kind === 'json') {
      expect(ex.paths).toEqual([])
    }
  })
})
