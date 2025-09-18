import { describe, it, expect } from 'vitest'
import { normalizeLocaleWithMap, normalizeLocaleDefault } from '../../src/util/localeNorm'

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

    it('should fall back to language part when locale not in map', () => {
      const langMap = {
        'en-US': 'en'
      }

      expect(normalizeLocaleWithMap('fr-FR', langMap)).toBe('fr')
      expect(normalizeLocaleWithMap('es-ES', langMap)).toBe('es')
      expect(normalizeLocaleWithMap('de-DE', langMap)).toBe('de')
    })

    it('should convert to lowercase in fallback', () => {
      const langMap = {}

      expect(normalizeLocaleWithMap('FR-FR', langMap)).toBe('fr')
      expect(normalizeLocaleWithMap('ES-MX', langMap)).toBe('es')
      expect(normalizeLocaleWithMap('DE', langMap)).toBe('de')
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

      expect(normalizeLocaleWithMap('en-US', langMap)).toBe('en')
      expect(normalizeLocaleWithMap('fr-CA', langMap)).toBe('fr')
      expect(normalizeLocaleWithMap('zh', langMap)).toBe('zh')
    })

    it('should handle complex locale codes with multiple hyphens', () => {
      const langMap = {
        'zh-Hans-CN': 'zh-CHS'
      }

      expect(normalizeLocaleWithMap('zh-Hans-CN', langMap)).toBe('zh-CHS')
      expect(normalizeLocaleWithMap('zh-Hant-TW', langMap)).toBe('zh') // falls back to first part
      expect(normalizeLocaleWithMap('en-US-POSIX', langMap)).toBe('en')
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

  describe('normalizeLocaleDefault', () => {
    it('should extract language part from locale with country', () => {
      expect(normalizeLocaleDefault('en-US')).toBe('en')
      expect(normalizeLocaleDefault('fr-FR')).toBe('fr')
      expect(normalizeLocaleDefault('zh-CN')).toBe('zh')
      expect(normalizeLocaleDefault('pt-BR')).toBe('pt')
    })

    it('should convert to lowercase', () => {
      expect(normalizeLocaleDefault('EN-US')).toBe('en')
      expect(normalizeLocaleDefault('FR-CA')).toBe('fr')
      expect(normalizeLocaleDefault('DE-DE')).toBe('de')
    })

    it('should handle simple locale codes without country', () => {
      expect(normalizeLocaleDefault('en')).toBe('en')
      expect(normalizeLocaleDefault('fr')).toBe('fr')
      expect(normalizeLocaleDefault('ES')).toBe('es')
    })

    it('should handle complex locale codes', () => {
      expect(normalizeLocaleDefault('zh-Hans-CN')).toBe('zh')
      expect(normalizeLocaleDefault('zh-Hant-TW')).toBe('zh')
      expect(normalizeLocaleDefault('en-US-POSIX')).toBe('en')
    })

    it('should handle edge cases', () => {
      expect(normalizeLocaleDefault('')).toBe('')
      expect(normalizeLocaleDefault('-')).toBe('')
      expect(normalizeLocaleDefault('a')).toBe('a')
    })

    it('should handle locales with underscores', () => {
      expect(normalizeLocaleDefault('en_US')).toBe('en_us')
      expect(normalizeLocaleDefault('zh_CN')).toBe('zh_cn')
    })

    it('should handle locales with dots', () => {
      expect(normalizeLocaleDefault('en.UTF-8')).toBe('en.utf')
      expect(normalizeLocaleDefault('fr.ISO8859-1')).toBe('fr.iso8859')
    })

    it('should split only on first hyphen', () => {
      expect(normalizeLocaleDefault('multi-part-locale-code')).toBe('multi')
      expect(normalizeLocaleDefault('x-custom-locale')).toBe('x')
    })
  })
})