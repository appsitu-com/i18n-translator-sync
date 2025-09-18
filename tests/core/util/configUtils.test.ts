import { describe, it, expect } from 'vitest'
import { formatZodError } from '../../../src/core/util/configUtils'
import { z } from 'zod'

describe('configUtils', () => {
  describe('formatZodError', () => {
    it('should format defaultMarkdownEngine validation errors', () => {
      const schema = z.object({
        defaultMarkdownEngine: z.enum(['azure', 'google', 'deepl', 'gemini', 'copy'])
      })

      const result = schema.safeParse({ defaultMarkdownEngine: 'invalid' })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(1)
        expect(formatted[0]).toContain('defaultMarkdownEngine:')
        expect(formatted[0]).toContain('(must be one of: azure, google, deepl, gemini, copy)')
      }
    })

    it('should format defaultJsonEngine validation errors', () => {
      const schema = z.object({
        defaultJsonEngine: z.enum(['azure', 'google', 'deepl', 'gemini', 'copy'])
      })

      const result = schema.safeParse({ defaultJsonEngine: 'badengine' })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(1)
        expect(formatted[0]).toContain('defaultJsonEngine:')
        expect(formatted[0]).toContain('(must be one of: azure, google, deepl, gemini, copy)')
      }
    })

    it('should format engineOverrides validation errors', () => {
      const schema = z.object({
        engineOverrides: z.record(z.string(), z.array(z.string()))
      })

      const result = schema.safeParse({
        engineOverrides: {
          'azure': 'not-an-array' // should be array
        }
      })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(1)
        // The actual field path will be 'engineOverrides.azure' which falls through to default case
        expect(formatted[0]).toContain('engineOverrides.azure:')
        expect(formatted[0]).toContain('Invalid input')
      }
    })

    it('should format engineOverrides field level validation errors', () => {
      const schema = z.object({
        engineOverrides: z.record(z.string(), z.array(z.string()))
      })

      const result = schema.safeParse({
        engineOverrides: 'not-an-object' // should be record
      })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(1)
        // This should match the 'engineOverrides' case
        expect(formatted[0]).toContain('Engine overrides:')
        expect(formatted[0]).toContain('(must be a record with string array values)')
      }
    })

    it('should format generic field validation errors', () => {
      const schema = z.object({
        sourceLocale: z.string(),
        targetLocales: z.array(z.string()),
        enableBackTranslation: z.boolean()
      })

      const result = schema.safeParse({
        sourceLocale: 123, // should be string
        targetLocales: 'not-array', // should be array
        enableBackTranslation: 'not-boolean' // should be boolean
      })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted.length).toBeGreaterThan(0)

        // Check that field names are included
        const joinedErrors = formatted.join('\n')
        expect(joinedErrors).toContain('sourceLocale:')
        expect(joinedErrors).toContain('targetLocales:')
        expect(joinedErrors).toContain('enableBackTranslation:')
      }
    })

    it('should handle nested field paths', () => {
      const schema = z.object({
        nested: z.object({
          field: z.string()
        })
      })

      const result = schema.safeParse({
        nested: {
          field: 123 // should be string
        }
      })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(1)
        expect(formatted[0]).toContain('nested.field:')
      }
    })

    it('should handle multiple validation errors', () => {
      const schema = z.object({
        defaultMarkdownEngine: z.enum(['azure', 'google', 'deepl', 'gemini', 'copy']),
        defaultJsonEngine: z.enum(['azure', 'google', 'deepl', 'gemini', 'copy']),
        sourceLocale: z.string()
      })

      const result = schema.safeParse({
        defaultMarkdownEngine: 'invalid1',
        defaultJsonEngine: 'invalid2',
        sourceLocale: 123
      })
      expect(result.success).toBe(false)

      if (!result.success) {
        const formatted = formatZodError(result.error)
        expect(formatted).toHaveLength(3)

        const joinedErrors = formatted.join('\n')
        expect(joinedErrors).toContain('defaultMarkdownEngine:')
        expect(joinedErrors).toContain('defaultJsonEngine:')
        expect(joinedErrors).toContain('sourceLocale:')
      }
    })

    it('should handle empty error issues', () => {
      // Create a mock ZodError with no issues
      const mockError = new z.ZodError([])
      const formatted = formatZodError(mockError)
      expect(formatted).toEqual([])
    })
  })
})