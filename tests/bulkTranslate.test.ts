import { it, vi, expect, describe, beforeEach, beforeAll, afterAll } from 'vitest'
import { bulkTranslateWithEngine } from '../src/bulkTranslate'
import * as reg from '../src/translators/registry'
import { deregisterTranslator, registerTranslator } from '../src/translators/registry'
import { before } from 'node:test'

class FakeTranslator {
  name = 'fake'
  normalizeLocale(l: string) {
    return l.toUpperCase()
  }

  async translateMany(texts: string[]) {
    return texts.map((t) => `[${t}]`)
  }
}

describe('bulkTranslateWithEngine()', () => {

  beforeAll(() => {
    // register fake translator
    registerTranslator(new FakeTranslator())
  })
  afterAll(() => {
    deregisterTranslator('fake')
  })

  it('uses cache for hits and engine for misses', async () => {
    // register fake translator
    // (reg as any).getTranslator = vi.fn(() => new FakeTranslator())


    // fake cache
    const cache = {
      getMany: vi.fn(async (_q: any) => new Map([['A::', 'A*']])),
      putMany: vi.fn(async () => {})
    }

    const out = await bulkTranslateWithEngine(
      ['A', 'B'],
      [null, null],
      'fake',
      { source: 'en', target: 'fr', apiConfig: {} },
      cache as any
    )
    expect(out).toEqual(['A*', '[B]'])
    expect(cache.putMany).toHaveBeenCalledTimes(1)
  })
})
