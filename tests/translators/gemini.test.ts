import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiTranslator } from '../../src/translators/gemini'

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

describe('GeminiTranslator', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes locale correctly', () => {
    expect(GeminiTranslator.normalizeLocale('en-US')).toBe('en')
    expect(GeminiTranslator.normalizeLocale('zh-CN')).toBe('zh')
    expect(GeminiTranslator.normalizeLocale('fr-CA')).toBe('fr')
    expect(GeminiTranslator.normalizeLocale('es-419')).toBe('es')
  })

  it('translates text successfully', async () => {
    // Mock successful response
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Hola mundo'
              }
            ]
          }
        }
      ]
    }

    vi.mocked(postJson).mockResolvedValueOnce(mockResponse)

    const result = await GeminiTranslator.translateMany(
      ['Hello world'],
      [null],
      {
        sourceLocale: 'en',
        targetLocale: 'es',
        apiConfig: {
          key: 'test-api-key',
          endpoint: 'https://test-endpoint',
          region: ''  // Not used by Gemini
        }
      }
    )

    expect(result).toEqual(['Hola mundo'])
    expect(postJson).toHaveBeenCalledTimes(1)

    const callArgs = vi.mocked(postJson).mock.calls[0]
    expect(callArgs[0]).toContain('https://test-endpoint/models/gemini-1.5-pro:generateContent')
    expect(callArgs[0]).toContain('key=test-api-key')

    const body = callArgs[1]
    expect(body.contents[0].parts[0].text).toContain('Translate the following text from en to es')
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
                text: 'Abrir archivo'
              }
            ]
          }
        }
      ]
    }

    vi.mocked(postJson).mockResolvedValueOnce(mockResponse)

    const result = await GeminiTranslator.translateMany(
      ['Open file'],
      ['Button label for opening a file'],
      {
        sourceLocale: 'en',
        targetLocale: 'es',
        apiConfig: {
          key: 'test-api-key',
          endpoint: 'https://test-endpoint',
          region: ''
        }
      }
    )

    expect(result).toEqual(['Abrir archivo'])
    expect(postJson).toHaveBeenCalledTimes(1)

    const body = vi.mocked(postJson).mock.calls[0][1]
    expect(body.contents[0].parts[0].text).toContain('Context: Button label for opening a file')
  })

  it('handles error by returning original text', async () => {
    vi.mocked(postJson).mockRejectedValueOnce(new Error('API Error'))

    const result = await GeminiTranslator.translateMany(
      ['Test error handling'],
      [null],
      {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig: {
          key: 'test-api-key',
          endpoint: 'https://test-endpoint',
          region: ''
        }
      }
    )

    expect(result).toEqual(['Test error handling'])
  })
})
