import { describe, it, expect } from 'vitest'
import { extractStructuredData, pathToString } from '../../src/extractors/structured'

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
})
