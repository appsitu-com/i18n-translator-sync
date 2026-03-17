import { it, vi, expect, describe, beforeAll, afterAll } from 'vitest'
import { bulkTranslateWithEngine } from '../src/bulkTranslate'
import { deregisterTranslator, registerTranslator } from '../src/translators/registry'
import type { Translator } from '../src/translators/types'
import type { TranslationCache } from '../src/core/cache/sqlite'

class FakeTranslator implements Translator {
  name = 'fake'
  async translateMany(texts: string[]) {
    return texts.map((t) => `[${t}]`)
  }
}

class ChunkedFakeTranslator implements Translator {
  name = 'fake-chunked'
  readonly calls: number[] = []

  async translateMany(texts: string[]) {
    this.calls.push(texts.length)
    return texts.map((t) => `[${t}]`)
  }
}

class MaxCharsFakeTranslator implements Translator {
  name = 'fake-maxchars'
  readonly calls: number[] = []

  async translateMany(texts: string[]) {
    this.calls.push(texts.length)
    return texts.map((t) => `[${t}]`)
  }
}

describe('bulkTranslateWithEngine()', () => {
  const chunkedTranslator = new ChunkedFakeTranslator()
  const maxCharsTranslator = new MaxCharsFakeTranslator()

  beforeAll(() => {
    registerTranslator(new FakeTranslator())
    registerTranslator(chunkedTranslator, { limit: 2 })
    registerTranslator(maxCharsTranslator, { limit: 10, maxchars: 5 })
  })

  afterAll(() => {
    deregisterTranslator('fake')
    deregisterTranslator('fake-chunked')
    deregisterTranslator('fake-maxchars')
  })

  it('uses cache for hits and engine for misses', async () => {
    const cache = {
      getMany: vi.fn(async () => new Map([['A::', { translation: 'A*', textPos: 0 }]])),
      putMany: vi.fn(async () => {})
    }

    const out = await bulkTranslateWithEngine(
      ['A', 'B'],
      [null, null],
      'fake',
      { source: 'en', target: 'fr', apiConfig: {}, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    expect(out.translations).toEqual(['A*', '[B]'])
    expect(out.stats).toEqual({
      apiCalls: 1,
      cacheHits: 1,
      total: 2
    })
    expect(cache.putMany).toHaveBeenCalledTimes(1)
  })

  it('chunks misses using translator registration limit', async () => {
    chunkedTranslator.calls.length = 0

    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {})
    }

    const out = await bulkTranslateWithEngine(
      ['A', 'B', 'C', 'D', 'E'],
      [null, null, null, null, null],
      'fake-chunked',
      { source: 'en', target: 'fr', apiConfig: {}, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    expect(out.translations).toEqual(['[A]', '[B]', '[C]', '[D]', '[E]'])
    expect(chunkedTranslator.calls).toEqual([2, 2, 1])
    expect(cache.putMany).toHaveBeenCalledTimes(1)
  })

  it('chunks misses using translator registration maxchars', async () => {
    maxCharsTranslator.calls.length = 0

    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {})
    }

    const out = await bulkTranslateWithEngine(
      ['AA', 'BB', 'C', 'DD'],
      [null, null, null, null],
      'fake-maxchars',
      { source: 'en', target: 'fr', apiConfig: {}, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    expect(out.translations).toEqual(['[AA]', '[BB]', '[C]', '[DD]'])
    expect(maxCharsTranslator.calls).toEqual([3, 1])
    expect(cache.putMany).toHaveBeenCalledTimes(1)
  })
})
