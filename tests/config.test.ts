import { it, expect, describe, vi, beforeEach } from 'vitest'
import { TranslateConfigSchema } from '../src/config'

describe('TranslateConfigSchema', () => {
  it('validates valid configurations', () => {
    const validConfig = {
      sourcePaths: ['i18n/en', 'docs/en'],
      sourceLocale: 'en',
      targetLocales: ['es', 'fr', 'de'],
      enableBackTranslation: true,
      defaultMarkdownEngine: 'azure',
      defaultJsonEngine: 'google',
      engineOverrides: {
        'deepl': ['fr', 'de'],
        'azure': ['es:en', 'ja:en'],
        'gemini': ['zh-CN']
      }
    }

    const result = TranslateConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validConfig)
    }
  })

  it('validates partial configurations', () => {
    const partialConfig = {
      sourcePaths: ['i18n/en'],
      sourceLocale: 'en'
    }

    const result = TranslateConfigSchema.safeParse(partialConfig)
    expect(result.success).toBe(true)
  })

  it('reports errors for invalid sourcePaths', () => {
    const invalidConfig = {
      sourcePaths: 'i18n/en', // Should be an array
      sourceLocale: 'en'
    }

    const result = TranslateConfigSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path[0]).toBe('sourcePaths')
    }
  })

  it('reports errors for invalid engine names', () => {
    const invalidConfig = {
      defaultMarkdownEngine: 'invalid-engine', // Not a valid engine
      sourceLocale: 'en'
    }

    const result = TranslateConfigSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path[0]).toBe('defaultMarkdownEngine')
    }
  })

  it('reports errors for invalid engineOverrides', () => {
    const invalidConfig = {
      engineOverrides: {
        'deepl': 'fr,de' // Should be an array
      }
    }

    const result = TranslateConfigSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path[0]).toBe('engineOverrides')
    }
  })

  it('accepts all valid translator engine names', () => {
    const engines = ['azure', 'google', 'deepl', 'gemini', 'copy']

    for (const engine of engines) {
      const config = {
        defaultMarkdownEngine: engine,
        defaultJsonEngine: engine
      }
      const result = TranslateConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
    }
  })
})
