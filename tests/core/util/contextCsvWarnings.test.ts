import { describe, it, expect } from 'vitest'
import { formatItemList, generateContextCsvWarnings, type ContextCsvStats } from '../../../src/core/util/contextCsvWarnings'

describe('contextCsvWarnings', () => {
  describe('formatItemList', () => {
    it('should format items without truncation when under limit', () => {
      const items = ['item1', 'item2', 'item3']
      const result = formatItemList(items, 6)
      expect(result).toBe('item1, item2, item3')
    })

    it('should format items with truncation when over limit', () => {
      const items = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7', 'item8']
      const result = formatItemList(items, 6)
      expect(result).toBe('item1, item2, item3, item4, item5, item6 …')
    })

    it('should use default max items of 6', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      const result = formatItemList(items)
      expect(result).toBe('a, b, c, d, e, f …')
    })

    it('should handle empty array', () => {
      const items: string[] = []
      const result = formatItemList(items)
      expect(result).toBe('')
    })

    it('should handle single item', () => {
      const items = ['single']
      const result = formatItemList(items)
      expect(result).toBe('single')
    })

    it('should handle exact limit', () => {
      const items = ['a', 'b', 'c']
      const result = formatItemList(items, 3)
      expect(result).toBe('a, b, c')
    })

    it('should handle custom max items', () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      const result = formatItemList(items, 2)
      expect(result).toBe('a, b …')
    })
  })

  describe('generateContextCsvWarnings', () => {
    it('should generate warning for unknown context paths', () => {
      const ctxMap = {
        'known.path': 'context',
        'unknown.path': 'context',
        'another.unknown': 'context'
      }
      const validPaths = new Set(['known.path'])
      const stats: ContextCsvStats = {
        duplicates: [],
        emptyValues: []
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Unknown context path(s):')
      expect(result[0]).toContain('unknown.path')
      expect(result[0]).toContain('another.unknown')
    })

    it('should generate warning for duplicate paths', () => {
      const ctxMap = {}
      const validPaths = new Set()
      const stats: ContextCsvStats = {
        duplicates: ['duplicate1', 'duplicate2'],
        emptyValues: []
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Duplicate path(s):')
      expect(result[0]).toContain('duplicate1')
      expect(result[0]).toContain('duplicate2')
    })

    it('should generate warning for empty values', () => {
      const ctxMap = {}
      const validPaths = new Set()
      const stats: ContextCsvStats = {
        duplicates: [],
        emptyValues: ['empty1', 'empty2', 'empty3']
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Empty context value(s):')
      expect(result[0]).toContain('empty1')
      expect(result[0]).toContain('empty2')
      expect(result[0]).toContain('empty3')
    })

    it('should generate multiple warnings when multiple issues exist', () => {
      const ctxMap = {
        'unknown1': 'context',
        'unknown2': 'context',
        'known': 'context'
      }
      const validPaths = new Set(['known'])
      const stats: ContextCsvStats = {
        duplicates: ['dup1', 'dup2'],
        emptyValues: ['empty1']
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(3)
      expect(result.some(msg => msg.includes('Unknown context path(s)'))).toBe(true)
      expect(result.some(msg => msg.includes('Duplicate path(s)'))).toBe(true)
      expect(result.some(msg => msg.includes('Empty context value(s)'))).toBe(true)
    })

    it('should return empty array when no issues', () => {
      const ctxMap = {
        'known1': 'context',
        'known2': 'context'
      }
      const validPaths = new Set(['known1', 'known2'])
      const stats: ContextCsvStats = {
        duplicates: [],
        emptyValues: []
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toEqual([])
    })

    it('should handle empty context map', () => {
      const ctxMap = {}
      const validPaths = new Set(['path1', 'path2'])
      const stats: ContextCsvStats = {
        duplicates: [],
        emptyValues: []
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toEqual([])
    })

    it('should handle large lists with truncation', () => {
      const unknownPaths = Array.from({ length: 10 }, (_, i) => `unknown${i}`)
      const ctxMap = Object.fromEntries(unknownPaths.map(path => [path, 'context']))
      const validPaths = new Set()
      const stats: ContextCsvStats = {
        duplicates: Array.from({ length: 8 }, (_, i) => `dup${i}`),
        emptyValues: Array.from({ length: 12 }, (_, i) => `empty${i}`)
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(3)
      expect(result[0]).toContain('…') // unknown paths truncated
      expect(result[1]).toContain('…') // duplicates truncated
      expect(result[2]).toContain('…') // empty values truncated
    })

    it('should handle Set with mixed types for compatibility', () => {
      const ctxMap = {
        'string.path': 'context',
        '123': 'context'
      }
      const validPaths = new Set<unknown>(['string.path', 123, { obj: 'value' }])
      const stats: ContextCsvStats = {
        duplicates: [],
        emptyValues: []
      }

      const result = generateContextCsvWarnings(ctxMap, validPaths, stats)

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Unknown context path(s):')
      expect(result[0]).toContain('123') // Only '123' string is unknown
    })
  })
})