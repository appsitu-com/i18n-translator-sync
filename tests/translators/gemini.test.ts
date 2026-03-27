import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiTranslator, GEMINI_DEFAULT_ENDPOINT } from '../../src/translators/gemini'

const TEST_MODEL = 'gemini-test-model'

// Mock HTTP utilities
vi.mock('../../src/util/http', () => ({
  postJson: vi.fn()
}))

// Mock retry utilities
vi.mock('../../src/util/retry', () => ({
  withRetry: vi.fn((retry, fn) => fn())
}))

// Import mocked modules
import { postJson } from '../../src/util/http'
import { withRetry } from '../../src/util/retry'

describe('GeminiTranslator stub', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('translates text successfully', async () => {
    // Mock successful response
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '["Hola mundo"]'
              }
            ]
          }
        }
      ]
    }

    vi.mocked(postJson).mockResolvedValueOnce(mockResponse)

    const result = await GeminiTranslator.translateMany(['Hello world'], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      rootDir: '.',
      apiConfig: {
        apiKey: 'test-api-key',
        endpoint: 'https://test-endpoint',
        model: TEST_MODEL,
        temperature: 0.1,
        maxOutputTokens: 1024,
        timeoutMs: 60_000,
        langMap: {},
      }
    })

    expect(result).toEqual(['Hola mundo'])
    expect(postJson).toHaveBeenCalledTimes(1)

    const callArgs = vi.mocked(postJson).mock.calls[0]
    expect(callArgs[0]).toContain(`https://test-endpoint/models/${TEST_MODEL}:generateContent`)
    expect(callArgs[0]).toContain('key=test-api-key')

    const body = callArgs[1]
    expect(body.contents[0].parts[0].text).toContain('Translate each text from en to es')
    expect(body.contents[0].parts[0].text).toContain('Hello world')
  })

  it('handles context information when provided', async () => {
    // Mock successful response
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '["Abrir archivo"]'
              }
            ]
          }
        }
      ]
    }

    vi.mocked(postJson).mockResolvedValueOnce(mockResponse)

    const result = await GeminiTranslator.translateMany(['Open file'], ['Button label for opening a file'], {
      sourceLocale: 'en',
      targetLocale: 'es',
      rootDir: '.',
      apiConfig: {
        apiKey: 'test-api-key',
        endpoint: 'https://test-endpoint',
        model: TEST_MODEL,
        temperature: 0.1,
        maxOutputTokens: 1024,
        timeoutMs: 60_000,
        langMap: {},
      }
    })

    expect(result).toEqual(['Abrir archivo'])
    expect(postJson).toHaveBeenCalledTimes(1)

    const body = vi.mocked(postJson).mock.calls[0][1]
    expect(body.contents[0].parts[0].text).toContain('Button label for opening a file')
  })

  it('handles error by returning original text', async () => {
    vi.mocked(postJson).mockRejectedValue(new Error('API Error'))

    await expect(
      GeminiTranslator.translateMany(['Test error handling'], [null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        rootDir: '.',
        apiConfig: {
          apiKey: 'test-api-key',
          endpoint: 'https://test-endpoint',
          model: TEST_MODEL,
          temperature: 0.1,
          maxOutputTokens: 1024,
          timeoutMs: 60_000,
          langMap: {},
        }
      })
    ).rejects.toThrow('API Error')
  })
})

