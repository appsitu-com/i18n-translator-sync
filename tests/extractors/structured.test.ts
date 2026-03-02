import { describe, it, expect } from 'vitest'
import { extractStructuredData, pathToString, isExcluded } from '../../src/extractors/structured'

describe('Structured Data Extractor', () => {
  describe('pathToString', () => {
    it('converts simple path to string', () => {
      expect(pathToString(['user', 'name'])).toBe('user.name')
    })

    it('handles array indices', () => {
      expect(pathToString(['users', 0, 'name'])).toBe('users[0].name')
    })

    it('handles special characters in keys', () => {
      expect(pathToString(['user', 'full-name'])).toBe('user["full-name"]')
    })
  })

  describe('extractStructuredData', () => {
    it('extracts string values from an object with default kind', () => {
      const input = {
        title: 'Hello',
        description: 'World',
        nested: {
          value: 'Nested value'
        },
        array: ['Item 1', 'Item 2']
      }

      const formatOutput = (obj: any) => JSON.stringify(obj)
      const result = extractStructuredData(input, formatOutput)

      expect(result.kind).toBe('json') // Default kind
      expect(result.segments).toEqual(['Hello', 'World', 'Nested value', 'Item 1', 'Item 2'])
      expect(result.paths).toHaveLength(5)
    })

    it('extracts string values from an object with yaml kind', () => {
      const input = {
        title: 'Hello',
        description: 'World',
        nested: {
          value: 'Nested value'
        },
        array: ['Item 1', 'Item 2']
      }

      const formatOutput = (obj: any) => JSON.stringify(obj)
      const result = extractStructuredData(input, formatOutput, 'yaml')

      expect(result.kind).toBe('yaml') // Yaml kind
      expect(result.segments).toEqual(['Hello', 'World', 'Nested value', 'Item 1', 'Item 2'])
      expect(result.paths).toHaveLength(5)
    })

    it('rebuilds object with translations', () => {
      const input = {
        greeting: 'Hello',
        farewell: 'Goodbye'
      }

      const formatOutput = (obj: any) => JSON.stringify(obj)
      const extraction = extractStructuredData(input, formatOutput)
      const translations = ['Hola', 'Adiós']
      const output = extraction.rebuild(translations)

      const expected = JSON.stringify({
        greeting: 'Hola',
        farewell: 'Adiós'
      })

      expect(output).toBe(expected)
    })

    it('handles custom formatters', () => {
      const input = {
        greeting: 'Hello',
        farewell: 'Goodbye'
      }

      // Custom formatter that adds indentation
      const formatOutput = (obj: any) => JSON.stringify(obj, null, 4)
      const extraction = extractStructuredData(input, formatOutput)
      const translations = ['Hola', 'Adiós']
      const output = extraction.rebuild(translations)

      const expected = JSON.stringify({
        greeting: 'Hola',
        farewell: 'Adiós'
      }, null, 4)

      expect(output).toBe(expected)
    })
  })

  describe('isExcluded', () => {
    it('excludes by key name at any depth', () => {
      const keys = new Set(['id'])
      const paths = new Set<string>()
      expect(isExcluded(['id'], keys, paths)).toBe(true)
      expect(isExcluded(['user', 'id'], keys, paths)).toBe(true)
      expect(isExcluded(['user', 'name'], keys, paths)).toBe(false)
    })

    it('excludes by exact dotted path', () => {
      const keys = new Set<string>()
      const paths = new Set(['meta.version'])
      expect(isExcluded(['meta', 'version'], keys, paths)).toBe(true)
      expect(isExcluded(['other', 'version'], keys, paths)).toBe(false)
    })

    it('returns false for empty exclusion sets', () => {
      expect(isExcluded(['any', 'path'], new Set(), new Set())).toBe(false)
    })
  })

  describe('extractStructuredData with exclusions', () => {
    it('excludes keys by name at any depth', () => {
      const input = {
        id: 'skip-me',
        greeting: 'Hello',
        nested: { id: 'skip-nested', label: 'Label' }
      }
      const result = extractStructuredData(
        input, (obj) => JSON.stringify(obj), 'json',
        { excludeKeys: ['id'] }
      )
      expect(result.segments).toEqual(['Hello', 'Label'])
    })

    it('excludes by exact dotted path', () => {
      const input = {
        meta: { version: '1.0', label: 'Meta' },
        greeting: 'Hello'
      }
      const result = extractStructuredData(
        input, (obj) => JSON.stringify(obj), 'json',
        { excludeKeyPaths: ['meta.version'] }
      )
      expect(result.segments).toEqual(['Meta', 'Hello'])
    })

    it('excluded values are preserved in rebuild', () => {
      const input = {
        id: 'keep-this',
        greeting: 'Hello',
        farewell: 'Goodbye'
      }
      const result = extractStructuredData(
        input, (obj) => JSON.stringify(obj), 'json',
        { excludeKeys: ['id'] }
      )
      expect(result.segments).toEqual(['Hello', 'Goodbye'])
      const output = JSON.parse(result.rebuild(['Hola', 'Adiós']))
      expect(output.id).toBe('keep-this')  // unchanged
      expect(output.greeting).toBe('Hola')
      expect(output.farewell).toBe('Adiós')
    })

    it('excludes entire subtree under excluded key', () => {
      const input = {
        meta: { version: '1.0', author: 'Test' },
        greeting: 'Hello'
      }
      const result = extractStructuredData(
        input, (obj) => JSON.stringify(obj), 'json',
        { excludeKeys: ['meta'] }
      )
      expect(result.segments).toEqual(['Hello'])
    })
  })
})
