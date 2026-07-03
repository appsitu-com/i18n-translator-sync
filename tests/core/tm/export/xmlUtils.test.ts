import { describe, it, expect } from 'vitest'
import { escapeXml } from '../../../../src/core/tm/export/xmlUtils'

describe('xmlUtils', () => {
  it('escapes XML special characters', () => {
    const value = `a&b<c>d"e'f`
    expect(escapeXml(value)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })

  it('returns unchanged value when no escape is needed', () => {
    expect(escapeXml('plain text')).toBe('plain text')
  })
})
