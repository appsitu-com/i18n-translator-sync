import { describe, it, expect } from 'vitest'
import { normalizeLocaleWithMap } from '../../src/util/localeNorm'

describe('localeNorm', () => {
  describe('normalizeLocaleWithMap', () => {
    it('should use mapping when locale exists in map', () => {
      const langMap = {
        'en-US': 'en',
        'zh-CN': 'zh-CHS',
        'pt-BR': 'pt'
      }

      expect(normalizeLocaleWithMap('en-US', langMap)).toBe('en')
      expect(normalizeLocaleWithMap('zh-CN', langMap)).toBe('zh-CHS')
      expect(normalizeLocaleWithMap('pt-BR', langMap)).toBe('pt')
    })

    it('should handle simple locale codes', () => {
      const langMap = {
        'zh': 'zh-CHS'
      }

      expect(normalizeLocaleWithMap('zh', langMap)).toBe('zh-CHS')
      expect(normalizeLocaleWithMap('en', langMap)).toBe('en')
      expect(normalizeLocaleWithMap('fr', langMap)).toBe('fr')
    })

    it('should handle empty language map', () => {
      const langMap = {}

      expect(normalizeLocaleWithMap('en-US', langMap)).toBe('en-US')
      expect(normalizeLocaleWithMap('fr-CA', langMap)).toBe('fr-CA')
      expect(normalizeLocaleWithMap('zh', langMap)).toBe('zh')
    })

    it('should handle complex locale codes with multiple hyphens', () => {
      const langMap = {
        'zh-Hans-CN': 'zh-CHS'
      }

      expect(normalizeLocaleWithMap('zh-Hans-CN', langMap)).toBe('zh-CHS')
      expect(normalizeLocaleWithMap('zh-Hant-TW', langMap)).toBe('zh-Hant-TW') // falls back to full locale
    })

    it('should handle edge cases', () => {
      const langMap = {
        'empty': '',
        'self': 'self'
      }

      expect(normalizeLocaleWithMap('empty', langMap)).toBe('')
      expect(normalizeLocaleWithMap('self', langMap)).toBe('self')
      expect(normalizeLocaleWithMap('', langMap)).toBe('')
    })

    it('should preserve exact matches from map even if unusual', () => {
      const langMap = {
        'special-case': 'UPPER-CASE',
        'another': 'with.dots'
      }

      expect(normalizeLocaleWithMap('special-case', langMap)).toBe('UPPER-CASE')
      expect(normalizeLocaleWithMap('another', langMap)).toBe('with.dots')
    })
  })
})