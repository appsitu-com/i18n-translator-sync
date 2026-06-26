import { describe, expect, it } from 'vitest'
import { resolveMateCatLocale } from '../../../src/core/review/mateCatLocaleResolver'

describe('mateCatLocaleResolver', () => {
  it('maps known engine locale variants to MateCat defaults', () => {
    expect(resolveMateCatLocale('zh-Hans')).toBe('zh-CN')
    expect(resolveMateCatLocale('zh-Hant')).toBe('zh-TW')
    expect(resolveMateCatLocale('en')).toBe('en-US')
    expect(resolveMateCatLocale('hi')).toBe('hi-IN')
    expect(resolveMateCatLocale('pt')).toBe('pt-BR')
  })

  it('keeps canonical locale when no default mapping exists', () => {
    expect(resolveMateCatLocale('ab')).toBe('ab')
    expect(resolveMateCatLocale('custom-Locale')).toBe('custom-Locale')
  })

  it('applies user langMap override before default mapping', () => {
    const overrideMap = {
      'zh-Hans': 'zh-SG',
      en: 'en-GB'
    }

    expect(resolveMateCatLocale('zh-Hans', overrideMap)).toBe('zh-SG')
    expect(resolveMateCatLocale('en', overrideMap)).toBe('en-GB')
  })
})
