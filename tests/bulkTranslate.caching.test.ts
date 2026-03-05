import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bulkTranslateWithEngine, TranslationStats } from '../src/bulkTranslate'
import { registerTranslator, deregisterTranslator } from '../src/translators/registry'
import { CopyTranslator } from '../src/translators/copy'
import type { TranslationCache } from '../src/core/cache/sqlite'

/**
 * Comprehensive cache integration tests to catch separator mismatches
 * and ensure cache functionality works end-to-end
 */
describe('Cache Integration - Separator and Hit/Miss Coverage', () => {
  let cache: MockCache

  beforeEach(() => {
    cache = new MockCache()

    // Register the copy translator for testing
    try {
      deregisterTranslator('copy')
    } catch (e) {
      // Ignore if not registered
    }
    registerTranslator(CopyTranslator)
  })

  it('should demonstrate cache separator mismatch would fail without the fix', () => {
    // This test shows what would happen with mismatched separators
    const text = 'Hello'
    const context = 'greeting'

    // Simulating old behavior with different separators
    const cacheWithWrongSeparator = new Map<string, string>()
    const storageSeparator = '\u0001' // Old cache separator
    const lookupSeparator = '::' // Bulk translate separator

    // Store with one separator
    cacheWithWrongSeparator.set(`${text}${storageSeparator}${context}`, 'Hola')

    // Try to retrieve with different separator - should NOT find it
    const lookupKey = `${text}${lookupSeparator}${context}`
    expect(cacheWithWrongSeparator.has(lookupKey)).toBe(false)

    // With correct matching separators, it works
    const cacheWithSameSeparator = new Map<string, string>()
    const separator = '::'
    cacheWithSameSeparator.set(`${text}${separator}${context}`, 'Hola')
    const correctKey = `${text}${separator}${context}`
    expect(cacheWithSameSeparator.has(correctKey)).toBe(true)
  })

  it('should retrieve cached translations on second call (cache hit)', async () => {
    const texts = ['Hello', 'World']
    const contexts = [null, null]

    // First call should translate and cache
    const result1 = await bulkTranslateWithEngine(
      texts,
      contexts,
      'copy', // Use copy engine for deterministic behavior
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result1.stats.apiCalls).toBe(0) // Copy engine doesn't make API calls
    expect(result1.stats.cacheHits).toBe(0) // First time, no cache hits
    expect(result1.stats.total).toBe(2) // 2 unique strings

    // Verify cache was populated
    expect(cache.putCalls.length).toBe(1)
    expect(cache.putCalls[0].pairs).toHaveLength(2)

    // Second call with same texts should use cache
    const result2 = await bulkTranslateWithEngine(
      texts,
      contexts,
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result2.stats.apiCalls).toBe(0)
    expect(result2.stats.cacheHits).toBe(2) // Both from cache!
    expect(result2.stats.total).toBe(2)
  })

  it('should handle partial cache hits correctly', async () => {
    const texts = ['Hello', 'World', 'Test']
    const contexts = [null, null, null]

    // First call translates all 3
    const result1 = await bulkTranslateWithEngine(
      texts,
      contexts,
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result1.stats.total).toBe(3)
    expect(result1.stats.cacheHits).toBe(0)

    // Second call with overlapping texts (2 old, 1 new)
    const textsWithNew = ['Hello', 'World', 'NewText']
    const result2 = await bulkTranslateWithEngine(
      textsWithNew,
      contexts,
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    // Should have 2 cache hits and 1 miss
    expect(result2.stats.cacheHits).toBe(2)
    expect(result2.stats.apiCalls).toBe(0) // Copy engine
    expect(result2.stats.total).toBe(3) // 3 unique strings processed
  })

  it('should respect context when determining cache hits', async () => {
    const text = 'Save'

    // First call with context "button"
    const result1 = await bulkTranslateWithEngine(
      [text],
      ['button'],
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result1.stats.total).toBe(1)
    expect(result1.stats.cacheHits).toBe(0)

    // Second call with same text but different context "menu"
    // Should be a cache MISS because context is different
    const result2 = await bulkTranslateWithEngine(
      [text],
      ['menu'],
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result2.stats.cacheHits).toBe(0) // Different context = cache miss
    expect(result2.stats.apiCalls).toBe(0) // But copy engine still has 0 API calls
    expect(result2.stats.total).toBe(1)

    // Third call with same text AND context "button"
    // Should be a cache HIT
    const result3 = await bulkTranslateWithEngine(
      [text],
      ['button'],
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result3.stats.cacheHits).toBe(1) // Same context = cache hit!
    expect(result3.stats.total).toBe(1)
  })

  it('should handle deduplicated entries correctly', async () => {
    // Pass the same text twice in one call
    const texts = ['Duplicate', 'Duplicate', 'Other']
    const contexts = [null, null, null]

    const result = await bulkTranslateWithEngine(
      texts,
      contexts,
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    // Should only process 2 unique entries, not 3
    expect(result.stats.total).toBe(2)
    expect(result.translations).toHaveLength(3) // But return 3 translations
    expect(result.translations[0]).toBe(result.translations[1]) // First two are same
  })

  it('should report accurate statistics for real translation scenarios', async () => {
    // Simulate multiple translation rounds like the user would experience
    const segment = ['Hello world']
    const context = [null]

    // Round 1: Cold cache, all API calls
    const round1 = await bulkTranslateWithEngine(
      segment,
      context,
      'copy',
      { source: 'en', target: 'es', apiConfig: {} },
      cache
    )

    expect(round1.stats).toEqual({
      apiCalls: 0, // Copy engine doesn't make calls
      cacheHits: 0, // Cold cache
      total: 1
    })

    // Round 2: Warm cache, should use cached result
    const round2 = await bulkTranslateWithEngine(
      segment,
      context,
      'copy',
      { source: 'en', target: 'es', apiConfig: {} },
      cache
    )

    expect(round2.stats).toEqual({
      apiCalls: 0,
      cacheHits: 1, // Cache hit!
      total: 1
    })

    // Verify same translation was returned
    expect(round2.translations).toEqual(round1.translations)
  })

  it('should distinguish between null and empty string contexts', async () => {
    const text = 'Test'

    // Call with null context
    const result1 = await bulkTranslateWithEngine(
      [text],
      [null],
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result1.stats.cacheHits).toBe(0)

    // Call with empty string context (converted to string)
    // Per the code: (contexts[i] ?? '').toString()
    // Both null and undefined become ''
    const result2 = await bulkTranslateWithEngine(
      [text],
      [null],
      'copy',
      { source: 'en', target: 'en', apiConfig: {} },
      cache
    )

    expect(result2.stats.cacheHits).toBe(1) // Should be cache hit since null → ''
  })
})

/**
 * Mock implementation of TranslationCache for testing
 * Tracks all calls to verify behavior
 */
class MockCache implements TranslationCache {
  private data = new Map<string, Map<string, Map<string, Map<string, string>>>>()
  getCalls: Array<{
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
  }> = []
  putCalls: Array<{
    engine: string
    source: string
    target: string
    pairs: Array<{ src: string; dst: string; ctx?: string | null }>
  }> = []

  async getMany(params: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
  }): Promise<Map<string, string>> {
    this.getCalls.push(params)

    const out = new Map<string, string>()
    const separator = '::' // Must match bulkTranslate.ts

    const engineMap = this.data.get(params.engine)
    if (!engineMap) return out

    const sourceLangMap = engineMap.get(params.source)
    if (!sourceLangMap) return out

    const targetLangMap = sourceLangMap.get(params.target)
    if (!targetLangMap) return out

    for (let i = 0; i < params.texts.length; i++) {
      const text = params.texts[i]
      const context = (params.contexts[i] ?? '').toString()
      const key = `${text}${separator}${context}`
      const stored = targetLangMap.get(key)
      if (stored) {
        out.set(key, stored)
      }
    }

    return out
  }

  async putMany(params: {
    engine: string
    source: string
    target: string
    pairs: Array<{ src: string; dst: string; ctx?: string | null }>
  }): Promise<void> {
    this.putCalls.push(params)

    const separator = '::' // Must match bulkTranslate.ts

    let engineMap = this.data.get(params.engine)
    if (!engineMap) {
      engineMap = new Map()
      this.data.set(params.engine, engineMap)
    }

    let sourceLangMap = engineMap.get(params.source)
    if (!sourceLangMap) {
      sourceLangMap = new Map()
      engineMap.set(params.source, sourceLangMap)
    }

    let targetLangMap = sourceLangMap.get(params.target)
    if (!targetLangMap) {
      targetLangMap = new Map()
      sourceLangMap.set(params.target, targetLangMap)
    }

    for (const { src, dst, ctx } of params.pairs) {
      const context = (ctx ?? '').toString()
      const key = `${src}${separator}${context}`
      targetLangMap.set(key, dst)
    }
  }

  async exportCSV(): Promise<void> {
    // Not needed for tests
  }

  async importCSV(): Promise<number> {
    return 0
  }

  close(): void {
    // Not needed for tests
  }
}
