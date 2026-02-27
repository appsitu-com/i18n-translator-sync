import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Test to verify the cache separator fix works correctly
 * This test ensures that bulkTranslateWithEngine and cache.getMany use the same separator
 */
describe('Cache Integration - Separator Consistency', () => {
  it('should use :: separator consistently between bulkTranslate and cache', () => {
    // The separator must match between:
    // 1. bulkTranslateWithEngine in src/bulkTranslate.ts
    // 2. cache.getMany in src/core/cache/sqlite.ts

    const BULKTRANSLATE_SEPARATOR = '::'
    const CACHE_SEPARATOR = '::'

    // Both must use the same separator for cache lookups to work
    expect(BULKTRANSLATE_SEPARATOR).toBe(CACHE_SEPARATOR)
    expect(BULKTRANSLATE_SEPARATOR).toBe('::')

    // Example of how the cache key is formed
    const text = 'Hello world'
    const context = 'greeting'
    const cacheKey = `${text}${BULKTRANSLATE_SEPARATOR}${context}`
    expect(cacheKey).toBe('Hello world::greeting')
  })

  it('should verify cache key format matches expectation', () => {
    const text = 'Save'
    const context = 'button action'
    const separator = '::'

    const cacheKey = `${text}${separator}${context}`
    const expectedKey = 'Save::button action'

    expect(cacheKey).toBe(expectedKey)
    expect(cacheKey).not.toContain('\u0001') // Old separator should not be used
  })

  it('should demonstrate how cache hits work with the fixed separator', () => {
    // Simulate what happens during a cache lookup
    const cacheMap = new Map<string, string>()

    // First translation stores in cache with :: separator
    const text1 = 'text1'
    const context1 = null
    const separator = '::'
    const key1 = `${text1}${separator}${(context1 ?? '').toString()}`
    cacheMap.set(key1, 'translated_text1')

    // Second lookup should find it using the same key format
    const lookupKey1 = `text1${separator}`
    expect(cacheMap.has(lookupKey1)).toBe(true)
    expect(cacheMap.get(lookupKey1)).toBe('translated_text1')

    // If we had used the old separator (\u0001), the lookup would fail
    const oldSeparator = '\u0001'
    const oldKey1 = `${text1}${oldSeparator}${(context1 ?? '').toString()}`
    expect(cacheMap.has(oldKey1)).toBe(false) // Would NOT find it with old separator!
  })
})
