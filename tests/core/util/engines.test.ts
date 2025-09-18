import { describe, it, expect } from 'vitest'
import { createEngineOverrides } from '../../../src/core/util/engines'

describe('engines', () => {
  describe('createEngineOverrides', () => {
    it('should create bidirectional locale mappings for simple locale codes', () => {
      const config = {
        'deepl': ['fr', 'de'],
        'azure': ['es']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'deepl',
        'fr:en': 'deepl',
        'en:de': 'deepl',
        'de:en': 'deepl',
        'en:es': 'azure',
        'es:en': 'azure'
      })
    })

    it('should handle explicit locale pairs with colons', () => {
      const config = {
        'azure': ['es:en', 'ja:en'],
        'google': ['en:zh']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'es:en': 'azure',
        'ja:en': 'azure',
        'en:zh': 'google'
      })
    })

    it('should handle mixed simple locales and explicit pairs', () => {
      const config = {
        'deepl': ['fr', 'de:en'],
        'azure': ['es:en', 'it']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'deepl',
        'fr:en': 'deepl',
        'de:en': 'deepl',
        'es:en': 'azure',
        'en:it': 'azure',
        'it:en': 'azure'
      })
    })

    it('should handle empty configuration', () => {
      const config = {}

      const result = createEngineOverrides(config)

      expect(result).toEqual({})
    })

    it('should handle empty locale arrays', () => {
      const config = {
        'deepl': [],
        'azure': ['fr']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'azure',
        'fr:en': 'azure'
      })
    })

    it('should handle locale patterns with whitespace', () => {
      const config = {
        'deepl': [' fr ', '  de:en  '],
        'azure': [' es ']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'deepl',
        'fr:en': 'deepl',
        'de:en': 'deepl',
        'en:es': 'azure',
        'es:en': 'azure'
      })
    })

    it('should handle complex locale codes', () => {
      const config = {
        'deepl': ['fr-FR', 'de-DE'],
        'azure': ['en-US:es-ES', 'ja-JP']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr-FR': 'deepl',
        'fr-FR:en': 'deepl',
        'en:de-DE': 'deepl',
        'de-DE:en': 'deepl',
        'en-US:es-ES': 'azure',
        'en:ja-JP': 'azure',
        'ja-JP:en': 'azure'
      })
    })

    it('should override with last engine when multiple engines specify the same locale pair', () => {
      const config = {
        'deepl': ['fr'],
        'azure': ['fr'] // This should override deepl for fr
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'azure', // azure wins
        'fr:en': 'azure'  // azure wins
      })
    })

    it('should handle multiple colon-separated pairs', () => {
      const config = {
        'azure': ['en:fr', 'fr:de', 'de:it']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'azure',
        'fr:de': 'azure',
        'de:it': 'azure'
      })
    })

    it('should handle single locale with multiple engines', () => {
      const config = {
        'deepl': ['fr'],
        'google': ['de'],
        'azure': ['es']
      }

      const result = createEngineOverrides(config)

      expect(result).toEqual({
        'en:fr': 'deepl',
        'fr:en': 'deepl',
        'en:de': 'google',
        'de:en': 'google',
        'en:es': 'azure',
        'es:en': 'azure'
      })
    })
  })
})