import { vi } from 'vitest'

/**
 * Shared test utilities for mocking HTTP requests in translator tests
 */

export interface MockFetchOptions {
  /**
   * Function to transform the request body into a response
   */
  responseTransformer: (body: any, url: string) => any
  /**
   * Optional array to capture fetch calls for inspection
   */
  callsArray?: any[]
}

/**
 * Sets up a mock fetch implementation with customizable response transformation
 * @param options Configuration for the mock fetch behavior
 * @returns Cleanup function to restore original fetch
 */
export function setupMockFetch(options: MockFetchOptions): () => void {
  const originalFetch = globalThis.fetch as any
  const { responseTransformer, callsArray } = options

  // Setup mock fetch
  // @ts-expect-error - Mocking global fetch for testing
  global.fetch = vi.fn(async (url: string, init: any) => {
    let body: any = {}

    // Parse request body if present
    if (init?.body) {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = {}
      }
    }

    // Capture the call if array provided
    if (callsArray) {
      callsArray.push({ url, body })
    }

    // Generate response using transformer
    const responseData = responseTransformer(body, url)

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return JSON.stringify(responseData)
      }
    } as any
  })

  // Return cleanup function
  return () => {
    global.fetch = originalFetch
  }
}

/**
 * Response transformers for common translator APIs
 */
export const responseTransformers = {
  /**
   * DeepL API response format
   */
  deepl: (body: any) => ({
    translations: (body.text as string[]).map((s: string) => ({ text: s.toUpperCase() }))
  }),

  /**
   * Google Translate API response format
   */
  google: (body: any) => ({
    data: {
      translations: body.q.map((s: string) => ({ translatedText: s.toUpperCase() }))
    }
  }),

  /**
   * Azure Translator API response format
   */
  azure: (body: any) =>
    body.map((row: any) => ({
      translations: [{ text: (row.Text as string).toUpperCase() }]
    })),

  /**
   * Gemini API response format (echo with context)
   */
  gemini: (body: any) => ({
    echo: body
  })
}

/**
 * Standard beforeEach/afterEach setup for translator tests
 * @param transformer Response transformer function or name of predefined transformer
 * @param callsArray Optional array to capture calls
 * @returns Object with setup and cleanup functions
 */
export function createTranslatorTestSetup(
  transformer: keyof typeof responseTransformers | ((body: any, url: string) => any),
  callsArray?: any[]
) {
  let cleanup: (() => void) | undefined

  const setup = () => {
    const responseTransformer = typeof transformer === 'string'
      ? responseTransformers[transformer]
      : transformer

    cleanup = setupMockFetch({
      responseTransformer,
      callsArray
    })
  }

  const teardown = () => {
    if (cleanup) {
      cleanup()
      cleanup = undefined
    }
  }

  return { setup, teardown }
}