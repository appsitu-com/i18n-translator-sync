import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DeepLTranslator } from '../../src/translators/deepl'

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
      apiConfig: { apiKey: 'DEEPL', free: true, endpoint: 'https://api-free.deepl.com' }
    })
    // Upper-cased echo
    expect(out).toEqual(['SAVE', 'OPEN', 'CANCEL', 'TITLE'])
    // Should have made 3 calls: button, menu, headline
    const contexts = calls.map((c) => c.body.context || '').sort()
    // At least contains these, but exact number may vary if implementation changes
    expect(contexts).toEqual(['button', 'headline', 'menu'])
  })
})

// Tests using real DeepL API keys from translator.env
describe('deepl api', () => {
  let apiConfig: any

  beforeEach(() => {
    // Explicitly load translator.env file before each test
    const dotenv = require('dotenv')
    const path = require('path')
    const fs = require('fs')

    const envPath = path.resolve(process.cwd(), 'test-project/translator.env')
    if (fs.existsSync(envPath)) {
      console.log('Loading environment from:', envPath)
      const result = dotenv.config({ path: envPath, override: true })
      if (result.error) {
        console.error('Error loading translator.env:', result.error)
      }
    }

    // This will throw an error if the key isn't set or is a test key
    const key = process.env.DEEPL_TRANSLATION_KEY
    console.log('DeepL API key:', key ? `${key.substring(0, 5)}...` : 'undefined')
    if (!key || key === 'test-deepl-key') {
      throw new Error('Real DeepL API key required in translator.env for this test suite')
    }

    apiConfig = {
      apiKey: process.env.DEEPL_TRANSLATION_KEY,
      endpoint: process.env.DEEPL_TRANSLATION_URL || 'https://api-free.deepl.com',
      free: true
    }
  })

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
