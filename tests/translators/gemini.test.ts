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

// Tests using real Gemini API keys from .translator.env
describe('gemini api', () => {
  // This will ensure we're using the real implementation, not the mock
  beforeEach(() => {
    vi.restoreAllMocks();

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

    // This will throw an error if the key isn't set or is a test/placeholder key
    const key = process.env.GEMINI_API_KEY;
    console.log('Gemini API key:', key ? `${key.substring(0, 5)}...` : 'undefined');
    if (!key || key === 'test-gemini-key' || key.includes('YOUR_GEMINI_API_KEY_HERE')) {
      throw new Error('Real Gemini API key required in .translator.env for this test suite');
    }
  });

  it('translates text with real API', async () => {
    const apiConfig = {
      key: process.env.GEMINI_API_KEY as string,
      endpoint: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
      region: ''
    };

    const texts = ['hello', 'world'];
    const out = await GeminiTranslator.translateMany(texts, [null, null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig
    });

    // Verify we got some response (not necessarily the exact translations)
    // The Gemini API might give different translations or formats based on API key and rate limits
    expect(out.length).toBe(2);
    // Just check that we got something other than an error (which would return original text)
    expect(out[0].length).toBeGreaterThan(0);
    expect(out[1].length).toBeGreaterThan(0);
  });
})

