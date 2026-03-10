import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleTranslator } from '../../src/translators/google'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('google v3 stub', () => {
  const originalFetch = globalThis.fetch as typeof globalThis.fetch
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  const tempDir = mkdtempSync(join(tmpdir(), 'google-translator-test-'))
  const credentialsPath = join(tempDir, 'google-service-account.json')
  const cacheCredentialsPath = join(tempDir, 'google-service-account-cache.json')
  const serviceAccountJson = JSON.stringify({
    client_email: 'translator-test@example.iam.gserviceaccount.com',
    private_key: privateKeyPem,
    token_uri: 'https://oauth2.googleapis.com/token'
  })

  writeFileSync(credentialsPath, serviceAccountJson, 'utf-8')
  writeFileSync(cacheCredentialsPath, serviceAccountJson, 'utf-8')

  beforeEach(() => {
    vi.useRealTimers()

    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const targetUrl = String(url)
      if (targetUrl === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async text() {
            return JSON.stringify({ access_token: 'test-access-token' })
          }
        } as Response
      }

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
    vi.useRealTimers()
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('calls Google Cloud Translate v3 with OAuth token and maps responses by index', async () => {
    const out = await GoogleTranslator.translateMany(['a', 'b'], [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: {
        key: credentialsPath,
        endpoint: 'https://translation.googleapis.com',
        googleProjectId: 'demo-project',
        googleLocation: 'global'
      }
    })

    expect(out).toEqual(['A', 'B'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)

    const [, translateInit] = vi.mocked(globalThis.fetch).mock.calls[1]
    const [translateUrl] = vi.mocked(globalThis.fetch).mock.calls[1]
    expect(String(translateUrl)).toContain('/v3/projects/demo-project/locations/global:translateText')
    expect(String(translateUrl)).not.toContain('?key=')
    expect(translateInit?.headers).toMatchObject({
      Authorization: 'Bearer test-access-token'
    })

    const requestBody = JSON.parse(String(translateInit?.body)) as {
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
    const originalProjectId = process.env.GOOGLE_TRANSLATION_PROJECT_ID
    delete process.env.GOOGLE_TRANSLATION_PROJECT_ID

    try {
      await expect(
        GoogleTranslator.translateMany(['a'], [null], {
          sourceLocale: 'en',
          targetLocale: 'fr',
          apiConfig: {
            key: credentialsPath,
            endpoint: 'https://translation.googleapis.com'
          }
        })
      ).rejects.toThrow("Google Translate v3: missing 'googleProjectId'")
    } finally {
      if (originalProjectId === undefined) {
        delete process.env.GOOGLE_TRANSLATION_PROJECT_ID
      } else {
        process.env.GOOGLE_TRANSLATION_PROJECT_ID = originalProjectId
      }
    }
  })

  it('falls back to env vars when key and project are not provided in apiConfig', async () => {
    process.env.GOOGLE_TRANSLATION_KEY = credentialsPath
    process.env.GOOGLE_TRANSLATION_PROJECT_ID = 'env-project'
    process.env.GOOGLE_TRANSLATION_LOCATION = 'global'

    try {
      const out = await GoogleTranslator.translateMany(['env'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          endpoint: ''
        }
      })

      expect(out).toEqual(['ENV'])
    } finally {
      delete process.env.GOOGLE_TRANSLATION_KEY
      delete process.env.GOOGLE_TRANSLATION_PROJECT_ID
      delete process.env.GOOGLE_TRANSLATION_LOCATION
    }
  })

  it('reuses cached OAuth token for 15 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const opts = {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: {
        key: cacheCredentialsPath,
        endpoint: 'https://translation.googleapis.com',
        googleProjectId: 'demo-project',
        googleLocation: 'global'
      }
    }

    await GoogleTranslator.translateMany(['first'], [null], opts)
    await GoogleTranslator.translateMany(['second'], [null], opts)

    const calls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]))
    const tokenCalls = calls.filter((url) => url === 'https://oauth2.googleapis.com/token')
    expect(tokenCalls).toHaveLength(1)

    vi.setSystemTime(new Date('2026-01-01T00:15:01.000Z'))
    await GoogleTranslator.translateMany(['third'], [null], opts)

    const callsAfterExpiry = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]))
    const tokenCallsAfterExpiry = callsAfterExpiry.filter((url) => url === 'https://oauth2.googleapis.com/token')
    expect(tokenCallsAfterExpiry).toHaveLength(2)
  })

  it('accepts credentials as JSON string', async () => {
    const jsonString = JSON.stringify({
      client_email: 'translator-test@example.iam.gserviceaccount.com',
      private_key: privateKeyPem,
      token_uri: 'https://oauth2.googleapis.com/token'
    })

    const out = await GoogleTranslator.translateMany(['hello'], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: {
        key: jsonString,
        endpoint: 'https://translation.googleapis.com',
        googleProjectId: 'demo-project',
        googleLocation: 'global'
      }
    })

    expect(out).toEqual(['HELLO'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('accepts credentials as file path', async () => {
    const out = await GoogleTranslator.translateMany(['world'], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: {
        key: credentialsPath,
        endpoint: 'https://translation.googleapis.com',
        googleProjectId: 'demo-project',
        googleLocation: 'global'
      }
    })

    expect(out).toEqual(['WORLD'])
  })

  it('throws when credentials JSON string is invalid', async () => {
    await expect(
      GoogleTranslator.translateMany(['test'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          key: '{invalid json',
          endpoint: 'https://translation.googleapis.com',
          googleProjectId: 'demo-project'
        }
      })
    ).rejects.toThrow('failed to parse service credentials JSON')
  })

  it('throws when credentials JSON is missing required fields', async () => {
    const incompleteJson = JSON.stringify({
      client_email: 'test@example.com'
      // missing private_key
    })

    await expect(
      GoogleTranslator.translateMany(['test'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          key: incompleteJson,
          endpoint: 'https://translation.googleapis.com',
          googleProjectId: 'demo-project'
        }
      })
    ).rejects.toThrow("missing 'client_email' or 'private_key'")
  })

  it('throws when credentials file path does not exist', async () => {
    await expect(
      GoogleTranslator.translateMany(['test'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          key: '/nonexistent/path/to/creds.json',
          endpoint: 'https://translation.googleapis.com',
          googleProjectId: 'demo-project'
        }
      })
    ).rejects.toThrow('failed to read service credentials from')
  })
})
