import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRANSLATOR_ENV } from '../../src/core/constants'
import { OpenRouterTranslator } from '../../src/translators/openrouter'
import type { BulkTranslateOpts } from '../../src/translators/types'

// Create a mock fetch function
const mockFetch = vi.fn()

describe('OpenRouterTranslator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('OpenRouterTranslator', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      // Set up fetch mock for unit tests
      vi.stubGlobal('fetch', mockFetch)
    })

    // Helper function to create mock Response
    const createMockResponse = (data: any, status = 200) => {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        text: () => Promise.resolve(JSON.stringify(data)),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response)
    }

    const defaultOpts: BulkTranslateOpts = {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: 'test-api-key',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions'
      }
    }

    it('should have correct name', () => {
      expect(OpenRouterTranslator.name).toBe('openrouter')
    })

    describe('translateMany', () => {
      it('should translate texts successfully', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola', 'Adiós', 'Gracias']
                })
              }
            }
          ]
        }

        mockFetch.mockReturnValueOnce(createMockResponse(mockResponse))

        const texts = ['Hello', 'Goodbye', 'Thank you']
        const contexts = [null, null, null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hola', 'Adiós', 'Gracias'])
        expect(mockFetch).toHaveBeenCalledOnce()

        const [url, options] = mockFetch.mock.calls[0]
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
        expect(options.method).toBe('POST')
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json'
        })

        const body = JSON.parse(options.body)
        expect(body).toMatchObject({
          model: 'anthropic/claude-3-haiku',
          temperature: 0.1,
          max_tokens: 2048,
          response_format: {
            type: 'json_object',
            schema: expect.any(Object)
          }
        })
      })

      it('should handle texts with context', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Botón', 'Menú']
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Button', 'Menu']
        const contexts = ['UI element for clicking', 'Navigation element']
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Botón', 'Menú'])

        const [url, options] = mockFetch.mock.calls[0]
        const body = JSON.parse(options.body)
        const prompt = body.messages[1].content
        expect(prompt).toContain('Context information is provided')
        expect(prompt).toContain('UI element for clicking')
        expect(prompt).toContain('Navigation element')
      })

      it('should use custom model and parameters', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola']
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const customOpts: BulkTranslateOpts = {
          ...defaultOpts,
          apiConfig: {
            ...defaultOpts.apiConfig,
            openrouterModel: 'openai/gpt-4',
            temperature: 0.5,
            maxOutputTokens: 1024,
            systemPrompt: 'You are a specialized translator.'
          }
        }

        const texts = ['Hello']
        const contexts = [null]
        await OpenRouterTranslator.translateMany(texts, contexts, customOpts)

        const [url, options] = mockFetch.mock.calls[0]
        const body = JSON.parse(options.body)
        expect(body.model).toBe('openai/gpt-4')
        expect(body.temperature).toBe(0.5)
        expect(body.max_tokens).toBe(1024)
        expect(body.messages[0].content).toBe('You are a specialized translator.')
      })

      it('should handle API errors gracefully', async () => {
        mockFetch.mockRejectedValueOnce(new Error('API Error'))

        const texts = ['Hello', 'World']
        const contexts = [null, null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hello', 'World']) // Should return original texts
      })

      it('should handle invalid JSON response', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: 'Invalid JSON response'
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Hello']
        const contexts = [null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hello']) // Should return original texts
      })

      it('should handle missing translations array', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  error: 'No translations provided'
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Hello']
        const contexts = [null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hello']) // Should return original texts
      })

      it('should handle translation count mismatch', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola'] // Only 1 translation for 2 texts
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Hello', 'World']
        const contexts = [null, null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hello', 'World']) // Should return original texts
      })

      it('should handle non-string translations', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola', 123, null] // Mixed types
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Hello', 'World', 'Test']
        const contexts = [null, null, null]
        const result = await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        expect(result).toEqual(['Hola', 'World', 'Test']) // Should use original for invalid translations
      })

      it('should throw error when API key is missing', async () => {
        const optsWithoutKey: BulkTranslateOpts = {
          ...defaultOpts,
          apiConfig: {
            ...defaultOpts.apiConfig,
            key: ''
          }
        }

        const texts = ['Hello']
        const contexts = [null]

        await expect(OpenRouterTranslator.translateMany(texts, contexts, optsWithoutKey)).rejects.toThrow(
          "OpenRouter Translator: missing 'key'"
        )
      })

      it('should use default endpoint when not provided', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola']
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const optsWithoutEndpoint: BulkTranslateOpts = {
          ...defaultOpts,
          apiConfig: {
            key: 'test-key',
            endpoint: '' // Empty endpoint to test default
          }
        }

        const texts = ['Hello']
        const contexts = [null]
        await OpenRouterTranslator.translateMany(texts, contexts, optsWithoutEndpoint)

        const [url] = mockFetch.mock.calls[0]
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
      })

      it('should include proper headers for OpenRouter', async () => {
        const mockResponse = createMockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: ['Hola']
                })
              }
            }
          ]
        })

        mockFetch.mockReturnValueOnce(Promise.resolve(mockResponse))

        const texts = ['Hello']
        const contexts = [null]
        await OpenRouterTranslator.translateMany(texts, contexts, defaultOpts)

        const [url, options] = mockFetch.mock.calls[0]
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/appsitu-com/i18n-translator-sync',
          'X-Title': 'VSCode i18n Translator Extension'
        })
      })
    })
  })

  // Tests using real OpenRouter API keys from translator.env
  describe('openrouter api', () => {
    let apiConfig: any

    beforeEach(() => {
      // Restore real fetch for integration tests
      vi.unstubAllGlobals()

      // Explicitly load translator.env file before each test
      const dotenv = require('dotenv')
      const path = require('path')
      const fs = require('fs')

      const envPath = path.resolve(process.cwd(), TRANSLATOR_ENV)
      if (fs.existsSync(envPath)) {
        console.log('Loading environment from:', envPath)
        const result = dotenv.config({ path: envPath, override: true })
        if (result.error) {
          console.error('Error loading translator.env:', result.error)
        }
      }

      // This will throw an error if the key isn't set or is a test key
      const key = process.env.OPENROUTER_API_KEY
      console.log('OpenRouter API key:', key ? `${key.substring(0, 5)}...` : 'undefined')
      if (!key || key === 'test-openrouter-key') {
        throw new Error('Real OpenRouter API key required in translator.env for this test suite')
      }

      apiConfig = {
        key: process.env.OPENROUTER_API_KEY,
        endpoint: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
        openrouterModel: 'anthropic/claude-3-haiku', // Use a fast, inexpensive model for testing
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    })

    it('translates text without context', async () => {
      const texts = ['hello', 'world']
      const out = await OpenRouterTranslator.translateMany(texts, [null, null], {
        sourceLocale: 'en',
        targetLocale: 'fr',
        apiConfig
      })

      // Verify we got translations back
      expect(out).toHaveLength(2)
      expect(out[0]).not.toBe('hello') // Should be translated
      expect(out[1]).not.toBe('world') // Should be translated
      expect(typeof out[0]).toBe('string')
      expect(typeof out[1]).toBe('string')

      // Log the actual translations for manual verification
      console.log('OpenRouter translations:', { input: texts, output: out })
    }, 30000) // 30 second timeout for API calls

    it('translates text with context', async () => {
      const texts = ['save', 'open']
      const contexts = ['button action', 'menu item']
      const out = await OpenRouterTranslator.translateMany(texts, contexts, {
        sourceLocale: 'en',
        targetLocale: 'es',
        apiConfig
      })

      // Verify we got translations back
      expect(out).toHaveLength(2)
      expect(out[0]).not.toBe('save') // Should be translated
      expect(out[1]).not.toBe('open') // Should be translated
      expect(typeof out[0]).toBe('string')
      expect(typeof out[1]).toBe('string')

      // Log the actual translations for manual verification
      console.log('OpenRouter translations with context:', {
        input: texts,
        contexts: contexts,
        output: out
      })
    }, 30000) // 30 second timeout for API calls
  })
})
