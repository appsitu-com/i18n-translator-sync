import { describe, vi, it, expect, beforeEach, afterEach } from 'vitest'
import { AzureTranslator } from '../../src/translators/azure'

describe('azure stub', () => {
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
          return JSON.stringify(
            body.map((row: any) => ({
              translations: [{ text: (row.Text as string).toUpperCase() }]
            }))
          )
        }
      } as any
    })
  })

  afterEach(() => {
    // @ts-expect-error
    global.fetch = originalFetch
  })

  it('azure translates with batching', async () => {
    const out = await AzureTranslator.translateMany(['x', 'y', 'z'], [null, null, null], {
      sourceLocale: 'en-GB',
      targetLocale: 'fr-FR',
      apiConfig: {
        apiKey: 'AZ',
        region: 'westeurope',
        batchSize: 2,
        endpoint: 'https://api.cognitive.microsofttranslator.com'
      }
    })
    expect(out).toEqual(['X', 'Y', 'Z'])
  })

  it('requires region to be set in config', async () => {
    await expect(
      AzureTranslator.translateMany(['x'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          apiKey: 'AZ',
          region: '',
          endpoint: ''
        }
      })
    ).rejects.toThrow("missing 'region'")
  })
})

// Tests using real Azure API keys from translator.env
describe('azure api', () => {
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
    const key = process.env.AZURE_TRANSLATION_KEY
    console.log('Azure API key:', key ? `${key.substring(0, 5)}...` : 'undefined')
    if (!key || key === 'test-azure-key') {
      throw new Error('Real Azure API key required in translator.env for this test suite')
    }

    apiConfig = {
      apiKey: process.env.AZURE_TRANSLATION_KEY,
      region: process.env.AZURE_TRANSLATION_REGION || 'westus',
      endpoint: process.env.AZURE_TRANSLATION_URL || 'https://api.cognitive.microsofttranslator.com'
    }
  })

  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await AzureTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en-GB',
      targetLocale: 'fr-FR',
      apiConfig
    })

    expect(out.map((text) => text.toLowerCase())).toEqual(['bonjour', 'monde'])
  })
})
