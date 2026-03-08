import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleTranslator } from '../../src/translators/google'

describe('google v3 stub', () => {
  const originalFetch = globalThis.fetch as typeof globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { contents: string[] }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({
            translations: body.contents.map((entry) => ({ translatedText: entry.toUpperCase() }))
          })
        }
      } as Response
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls Google Cloud Translate v3 and maps responses by index', async () => {
    const out = await GoogleTranslator.translateMany(['a', 'b'], [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: {
        key: 'TEST',
        endpoint: 'https://translation.googleapis.com',
        googleProjectId: 'demo-project',
        googleLocation: 'global'
      }
    })

    expect(out).toEqual(['A', 'B'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(String(url)).toContain('/v3/projects/demo-project/locations/global:translateText?key=TEST')

    const requestBody = JSON.parse(String(init?.body)) as {
      contents: string[]
      sourceLanguageCode: string
      targetLanguageCode: string
      mimeType: string
    }
    expect(requestBody).toEqual({
      contents: ['a', 'b'],
      sourceLanguageCode: 'en',
      targetLanguageCode: 'fr',
      mimeType: 'text/plain'
    })
  })

  it('throws when googleProjectId is missing', async () => {
    await expect(
      GoogleTranslator.translateMany(['a'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          key: 'TEST',
          endpoint: 'https://translation.googleapis.com'
        }
      })
    ).rejects.toThrow("Google Translate v3: missing 'googleProjectId'")
  })
})
