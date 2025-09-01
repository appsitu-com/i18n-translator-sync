import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DeepLTranslator } from '../../src/translators/deepl'
import { getEnv } from '../../src/util/env';

describe('deepl stub', () => {
  const originalFetch = globalThis.fetch as any

  let calls: any[] = []

  beforeEach(() => {
    calls = []
    // @ts-expect-error
    global.fetch = vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body)
      calls.push({ url, body })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            translations: (body.text as string[]).map((s: string) => ({ text: s.toUpperCase() }))
          })
        }
      } as any
    })
  })

  afterEach(() => {
    // @ts-expect-error
    global.fetch = originalFetch
  })

  it('deepl groups by context and translates', async () => {
    const texts = ['save', 'open', 'cancel', 'title']
    const ctxs = ['button', 'menu', 'button', 'headline']
    const out = await DeepLTranslator.translateMany(texts, ctxs, {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: { key: 'DEEPL', free: true }
    })
    // Upper-cased echo
    expect(out).toEqual(['SAVE', 'OPEN', 'CANCEL', 'TITLE'])
    // Should have made 3 calls: button, menu, headline
    const contexts = calls.map((c) => c.body.context || '').sort()
    // At least contains these, but exact number may vary if implementation changes
    expect(contexts).toEqual(['button', 'headline', 'menu'])
  })
})

// Disabled to avoid using up free tier
describe.skip('deepl api', () => {

  const apiConfig = {
    key: getEnv('DEEPL_TRANSLATION_KEY'),
    endpoint: getEnv('DEEPL_TRANSLATION_URL'),
    free: true
  }

  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await DeepLTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig
    })

    expect(out).toEqual(['Bonjour', 'monde'])
  })
})