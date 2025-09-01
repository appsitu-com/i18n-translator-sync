import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GoogleTranslator } from '../../src/translators/google'
import { getEnv } from '../../src/util/env'

describe('google stub', () => {
  const originalFetch = globalThis.fetch as any

  beforeEach(() => {
    // @ts-expect-error
    global.fetch = vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            data: {
              translations: body.q.map((s: string) => ({ translatedText: s.toUpperCase() }))
            }
          })
        }
      } as any
    })
  })

  afterEach(() => {
    // @ts-expect-error
    global.fetch = originalFetch
  })

  it('google v2 translates in bulk', async () => {
    const out = await GoogleTranslator.translateMany(['a', 'b'], [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr-FR',
      apiConfig: { key: 'TEST' }
    })
    expect(out).toEqual(['A', 'B'])
  })
})

describe('google API', () => {
  const apiConfig = {
    key: getEnv('GOOGLE_TRANSLATION_KEY'),
    endpoint: getEnv('GOOGLE_TRANSLATION_URL')
  }
  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await GoogleTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr-FR',
      apiConfig
    })

    expect(out).toEqual(['Bonjour', 'monde'])
  })
})
