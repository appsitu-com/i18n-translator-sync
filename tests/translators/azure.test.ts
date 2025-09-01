import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AzureTranslator } from '../../src/translators/azure'
import { getEnv } from '../../src/util/env';

describe('azure', () => {
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
      apiConfig: { key: 'AZ', region: 'westeurope', batchSize: 2, endpoint: 'https://api.cognitive.microsofttranslator.com' }
    })
    expect(out).toEqual(['X', 'Y', 'Z'])
  })
})

// Requires API key set via environment variable
describe('azure api', () => {
  const apiConfig = {
    key: getEnv('AZURE_TRANSLATION_KEY'),
    region: getEnv('AZURE_TRANSLATION_REGION'),
    endpoint: getEnv('AZURE_TRANSLATION_URL')
  }

  it('translates text without context', async () => {
    const texts = ['hello', 'world']
    const out = await AzureTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en-GB',
      targetLocale: 'fr-FR',
      apiConfig
    })

    expect(out).toEqual(['Bonjour', 'monde'])
  })
})
