import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GoogleTranslator } from '../../src/translators/google'

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
      apiConfig: { key: 'TEST', endpoint: 'https://translation.googleapis.com' }
    })
    expect(out).toEqual(['A', 'B'])
  })
})

// Tests using real Google API keys from .translator.env
describe('google api', () => {
  let apiConfig: any;

  beforeEach(() => {
    // Explicitly load .translator.env file before each test
    const dotenv = require('dotenv');
    const path = require('path');
    const fs = require('fs');

    const envPath = path.resolve(process.cwd(), 'test-project/.translator.env');
    if (fs.existsSync(envPath)) {
      console.log('Loading environment from:', envPath);
      const result = dotenv.config({ path: envPath, override: true });
      if (result.error) {
        console.error('Error loading .translator.env:', result.error);
      }
    }

    // This will throw an error if the key isn't set or is a test key
    const key = process.env.GOOGLE_TRANSLATION_KEY;
    console.log('Google API key:', key ? `${key.substring(0, 5)}...` : 'undefined');
    if (!key || key === 'test-google-key') {
      throw new Error('Real Google API key required in .translator.env for this test suite');
    }

    apiConfig = {
      key: process.env.GOOGLE_TRANSLATION_KEY,
      endpoint: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com'
    }
  });

  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await GoogleTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr-FR',
      apiConfig
    })

    expect(out).toEqual(['Bonjour', 'monde'])
  });
})
