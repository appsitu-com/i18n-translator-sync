import { it, vi, expect, describe, beforeAll, afterAll } from 'vitest'
import { bulkTranslateWithEngine } from '../src/bulkTranslate'
import { deregisterTranslator, registerTranslator } from '../src/translators/registry'
import type { Translator } from '../src/translators/types'
import type { TranslationCache } from '../src/core/cache/sqlite'
import type { IGoogleConfig } from '../src/core/config'

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

class LocaleCaptureTranslator implements Translator {
  name = 'fake-langmap'
  readonly calls: Array<{ sourceLocale: string; targetLocale: string }> = []

  async translateMany(_texts: string[], _contexts: (string | null | undefined)[], opts: { sourceLocale: string; targetLocale: string }) {
    this.calls.push({ sourceLocale: opts.sourceLocale, targetLocale: opts.targetLocale })
    return ['[mapped]']
  }
}

describe('bulkTranslateWithEngine()', () => {
  const chunkedTranslator = new ChunkedFakeTranslator()
  const maxCharsTranslator = new MaxCharsFakeTranslator()
  const localeCaptureTranslator = new LocaleCaptureTranslator()

  beforeAll(() => {
    registerTranslator(new FakeTranslator())
    registerTranslator(chunkedTranslator, { limit: 2 })
    registerTranslator(maxCharsTranslator, { limit: 10, maxchars: 5 })
    registerTranslator(localeCaptureTranslator)
  })

  afterAll(() => {
    deregisterTranslator('fake')
    deregisterTranslator('fake-chunked')
    deregisterTranslator('fake-maxchars')
    deregisterTranslator('fake-langmap')
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

  it('applies langMap to both source and target locales for forward and back translation calls', async () => {
    localeCaptureTranslator.calls.length = 0

    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {})
    }

    const apiConfig: IGoogleConfig = {
      endpoint: 'https://translation.googleapis.com',
      googleLocation: 'global',
      timeoutMs: 30000,
      langMap: {
        en: 'EN-US',
        fr: 'FR'
      }
    }

    await bulkTranslateWithEngine(
      ['hello'],
      [null],
      'fake-langmap',
      { source: 'en', target: 'fr', apiConfig, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    await bulkTranslateWithEngine(
      ['bonjour'],
      [null],
      'fake-langmap',
      { source: 'fr', target: 'en', apiConfig, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    expect(localeCaptureTranslator.calls).toEqual([
      { sourceLocale: 'EN-US', targetLocale: 'FR' },
      { sourceLocale: 'FR', targetLocale: 'EN-US' }
    ])
  })

  it('skips whitespace-only strings and keeps them unchanged', async () => {
    chunkedTranslator.calls.length = 0

    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {})
    }

    const out = await bulkTranslateWithEngine(
      ['   ', 'A', '\n\t'],
      [null, null, null],
      'fake-chunked',
      { source: 'en', target: 'fr', apiConfig: {}, rootDir: process.cwd() },
      cache as unknown as TranslationCache
    )

    expect(out.translations).toEqual(['   ', '[A]', '\n\t'])
    expect(out.stats).toEqual({
      apiCalls: 1,
      cacheHits: 0,
      total: 1
    })
    expect(chunkedTranslator.calls).toEqual([1])
    expect(cache.getMany).toHaveBeenCalledWith(
      expect.objectContaining({
        texts: ['A'],
        contexts: ['']
      })
    )
  })
})
