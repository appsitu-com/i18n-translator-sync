import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerTranslator,
  getTranslator,
  getRegisteredTranslator,
  deregisterTranslator,
  pickEngine
} from '../../src/translators/registry'
import type { Translator, TranslatorEngine } from '../../src/translators/types'

describe('translators/registry', () => {
  // Mock translator for testing
  const mockTranslator: Translator = {
    name: 'test-translator',
    normalizeLocale: (locale: string) => locale,
    translateMany: async (texts: string[]) => texts.map(() => 'translated')
  }

  const mockTranslator2: Translator = {
    name: 'another-translator',
    normalizeLocale: (locale: string) => locale,
    translateMany: async (texts: string[]) => texts.map(() => 'another-translation')
  }

  beforeEach(() => {
    // Clear registry before each test
    deregisterTranslator('test-translator')
    deregisterTranslator('another-translator')
  })

  afterEach(() => {
    // Clean up after each test
    deregisterTranslator('test-translator')
    deregisterTranslator('another-translator')
  })

  describe('registerTranslator', () => {
    it('should register a translator', () => {
      registerTranslator(mockTranslator)

      const retrieved = getTranslator('test-translator')
      expect(retrieved).toBe(mockTranslator)
      expect(getRegisteredTranslator('test-translator').limit).toBe(Number.MAX_SAFE_INTEGER)
      expect(getRegisteredTranslator('test-translator').maxchars).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should register translator with explicit limit', () => {
      registerTranslator(mockTranslator, { limit: 7, maxchars: 1234 })

      const retrieved = getRegisteredTranslator('test-translator')
      expect(retrieved.translator).toBe(mockTranslator)
      expect(retrieved.limit).toBe(7)
      expect(retrieved.maxchars).toBe(1234)
    })

    it('should allow overriding existing translator', () => {
      registerTranslator(mockTranslator)
      registerTranslator(mockTranslator2)

      // Should be able to register with different name
      expect(getTranslator('test-translator')).toBe(mockTranslator)
      expect(getTranslator('another-translator')).toBe(mockTranslator2)
    })

    it('should replace translator with same name', () => {
      registerTranslator(mockTranslator)

      const updatedTranslator: Translator = {
        ...mockTranslator,
        translateMany: async (texts: string[]) => texts.map(() => 'updated-translation')
      }

      registerTranslator(updatedTranslator)

      const retrieved = getTranslator('test-translator')
      expect(retrieved).toBe(updatedTranslator)
      expect(retrieved).not.toBe(mockTranslator)
    })
  })

  describe('getTranslator', () => {
    it('should return registered translator', () => {
      registerTranslator(mockTranslator)

      const retrieved = getTranslator('test-translator')
      expect(retrieved).toBe(mockTranslator)
    })

    it('should throw error for unregistered translator', () => {
      expect(() => getTranslator('non-existent')).toThrow('Translator not registered: non-existent')
    })

    it('should be case sensitive', () => {
      registerTranslator(mockTranslator)

      expect(() => getTranslator('Test-Translator')).toThrow('Translator not registered: Test-Translator')
      expect(() => getTranslator('TEST-TRANSLATOR')).toThrow('Translator not registered: TEST-TRANSLATOR')
    })
  })

  describe('deregisterTranslator', () => {
    it('should remove registered translator', () => {
      registerTranslator(mockTranslator)
      expect(getTranslator('test-translator')).toBe(mockTranslator)

      deregisterTranslator('test-translator')
      expect(() => getTranslator('test-translator')).toThrow('Translator not registered: test-translator')
    })

    it('should be safe to call on non-existent translator', () => {
      expect(() => deregisterTranslator('non-existent')).not.toThrow()
    })

    it('should not affect other registered translators', () => {
      registerTranslator(mockTranslator)
      registerTranslator(mockTranslator2)

      deregisterTranslator('test-translator')

      expect(() => getTranslator('test-translator')).toThrow()
      expect(getTranslator('another-translator')).toBe(mockTranslator2)
    })
  })

  describe('pickEngine', () => {
    it('should return override engine when match found', () => {
      const params = {
        source: 'en',
        target: 'fr',
        defaults: { md: 'azure', json: 'google' },
        overrides: { 'en:fr': 'deepl' },
        fileType: 'json'
      }

      const result = pickEngine(params)
      expect(result).toBe('deepl')
    })

    it('should return default markdown engine for md file type', () => {
      const params = {
        source: 'en',
        target: 'es',
        defaults: { md: 'azure', json: 'google' },
        overrides: {},
        fileType: 'md'
      }

      const result = pickEngine(params)
      expect(result).toBe('azure')
    })

    it('should return default json engine for json file type', () => {
      const params = {
        source: 'en',
        target: 'de',
        defaults: { md: 'azure', json: 'google' },
        overrides: {},
        fileType: 'json'
      }

      const result = pickEngine(params)
      expect(result).toBe('google')
    })

    it('should fallback to json default for unknown file types', () => {
      const params = {
        source: 'en',
        target: 'it',
        defaults: { md: 'azure', json: 'google' },
        overrides: {},
        fileType: 'yaml'
      }

      const result = pickEngine(params)
      expect(result).toBe('google')
    })

    it('should prioritize overrides over defaults', () => {
      const params = {
        source: 'en',
        target: 'fr',
        defaults: { md: 'azure', json: 'google' },
        overrides: { 'en:fr': 'deepl' },
        fileType: 'md'
      }

      const result = pickEngine(params)
      expect(result).toBe('deepl') // override wins over md default
    })

    it('should handle complex locale pairs in overrides', () => {
      const params = {
        source: 'en-US',
        target: 'fr-FR',
        defaults: { md: 'azure', json: 'google' },
        overrides: { 'en-US:fr-FR': 'deepl' },
        fileType: 'json'
      }

      const result = pickEngine(params)
      expect(result).toBe('deepl')
    })

    it('should handle empty overrides', () => {
      const params = {
        source: 'en',
        target: 'ja',
        defaults: { md: 'azure', json: 'google' },
        overrides: {},
        fileType: 'json'
      }

      const result = pickEngine(params)
      expect(result).toBe('google')
    })

    it('should handle missing default for file type', () => {
      const params = {
        source: 'en',
        target: 'ko',
        defaults: { md: 'azure', json: 'google' },
        overrides: {},
        fileType: 'xml'
      }

      const result = pickEngine(params)
      expect(result).toBe('google') // falls back to json default
    })

    it('should handle multiple overrides correctly', () => {
      const overrides = {
        'en:fr': 'deepl',
        'en:de': 'azure',
        'fr:en': 'google'
      }

      expect(pickEngine({
        source: 'en', target: 'fr',
        defaults: { md: 'copy', json: 'copy' },
        overrides, fileType: 'json'
      })).toBe('deepl')

      expect(pickEngine({
        source: 'en', target: 'de',
        defaults: { md: 'copy', json: 'copy' },
        overrides, fileType: 'md'
      })).toBe('azure')

      expect(pickEngine({
        source: 'fr', target: 'en',
        defaults: { md: 'copy', json: 'copy' },
        overrides, fileType: 'json'
      })).toBe('google')
    })
  })
})