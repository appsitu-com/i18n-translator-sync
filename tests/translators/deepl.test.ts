import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DeepLTranslator, DEEPL_DEFAULT_ENDPOINT_FREE } from '../../src/translators/deepl'

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
    global.fetch = originalFetch
  })

  it('deepl groups by context and translates', async () => {
    const texts = ['save', 'open', 'cancel', 'title']
    const ctxs = ['button', 'menu', 'button', 'headline']
    const out = await DeepLTranslator.translateMany(texts, ctxs, {
      sourceLocale: 'en',
      targetLocale: 'fr',
      rootDir: '.',
      apiConfig: {
        apiKey: 'DEEPL',
        endpoint: DEEPL_DEFAULT_ENDPOINT_FREE,
        timeoutMs: 30_000,
        langMap: {},
      }
    })
    // Upper-cased echo
    expect(out).toEqual(['SAVE', 'OPEN', 'CANCEL', 'TITLE'])
    // Should have made 3 calls: button, menu, headline
    const contexts = calls.map((c) => c.body.context || '').sort()
    // At least contains these, but exact number may vary if implementation changes
    expect(contexts).toEqual(['button', 'headline', 'menu'])
  })

  it('maps both source and target locales using langMap', async () => {
    await DeepLTranslator.translateMany(['hello'], [null], {
      sourceLocale: 'fr',
      targetLocale: 'en',
      rootDir: '.',
      apiConfig: {
        apiKey: 'DEEPL',
        endpoint: DEEPL_DEFAULT_ENDPOINT_FREE,
        timeoutMs: 30_000,
        langMap: {
          en: 'EN-US',
          fr: 'FR'
        },
      }
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].body.source_lang).toBe('FR')
    expect(calls[0].body.target_lang).toBe('EN-US')
  })

  it('normalizes mapped source regional variants to base DeepL source language', async () => {
    await DeepLTranslator.translateMany(['hello'], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      rootDir: '.',
      apiConfig: {
        apiKey: 'DEEPL',
        endpoint: DEEPL_DEFAULT_ENDPOINT_FREE,
        timeoutMs: 30_000,
        langMap: {
          en: 'EN-US',
          fr: 'FR'
        },
      }
    })

    expect(calls).toHaveLength(1)
    // DeepL source_lang strips regional variants via toLanguage(), so EN-US → EN
    expect(calls[0].body.source_lang).toBe('EN')
    expect(calls[0].body.target_lang).toBe('FR')
  })

  it('protects braced variables using xml tag handling and restores them', async () => {
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
            translations: [{ text: 'Bonjour <x id="1">{title}</x> et <x id="2">{count}</x>' }]
          })
        }
      } as any
    })

    const out = await DeepLTranslator.translateMany(['Hello {title} and {count}'], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      rootDir: '.',
      apiConfig: {
        apiKey: 'DEEPL',
        endpoint: DEEPL_DEFAULT_ENDPOINT_FREE,
        timeoutMs: 30_000,
        langMap: {},
      }
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].body.text).toEqual(['Hello <x id="1">{title}</x> and <x id="2">{count}</x>'])
    expect(calls[0].body.tag_handling).toBe('xml')
    expect(calls[0].body.ignore_tags).toEqual(['x'])
    expect(out).toEqual(['Bonjour {title} et {count}'])
  })

  it('adapts request and parsing when endpoint is Eden AI', async () => {
    // @ts-expect-error
    global.fetch = vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body)
      calls.push({ url, body, headers: init.headers })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            deepl: {
              text: 'Bonjour <x id="1">{title}</x>'
            }
          })
        }
      } as any
    })

    const out = await DeepLTranslator.translateMany(['Hello {title}'], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      rootDir: '.',
      apiConfig: {
        apiKey: 'EDEN_KEY',
        endpoint: 'https://api.edenai.run',
        timeoutMs: 30_000,
        langMap: {},
      }
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.edenai.run/v2/translation/automatic_translation')
    expect(calls[0].headers.Authorization).toBe('Bearer EDEN_KEY')
    expect(calls[0].body.providers).toBe('deepl')
    expect(calls[0].body.source_language).toBe('en')
    expect(calls[0].body.target_language).toBe('fr')
    expect(calls[0].body.text).toBe('Hello <x id="1">{title}</x>')
    expect(out).toEqual(['Bonjour {title}'])
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
      endpoint: process.env.DEEPL_TRANSLATION_URL,
      timeoutMs: 30_000,
      langMap: {},
    }
  })

  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await DeepLTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      rootDir: '.',
      apiConfig
    })

    expect(out.map((t) => t.toLowerCase())).toEqual(['bonjour', 'monde'])
  }, 5000)
})
