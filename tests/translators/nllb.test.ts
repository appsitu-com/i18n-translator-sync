import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NllbTranslator, NLLB_DEFAULT_MODEL, NLLB_DEFAULT_SEPARATOR, NLLB_DEFAULT_OPENROUTER_ENDPOINT } from '../../src/translators/nllb'
import type { BulkTranslateOpts } from '../../src/translators/types'
import type { INllbConfig } from '../../src/translators/nllb'

const mockFetch = vi.fn()

function createMockResponse(content: string, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(JSON.stringify({
      choices: [{ message: { content } }]
    }))
  } as Response)
}

describe('NllbTranslator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  const defaultOpts: BulkTranslateOpts<INllbConfig> = {
    sourceLocale: 'en',
    targetLocale: 'fr',
    rootDir: '.',
    apiConfig: {
      apiKey: 'test-api-key',
      endpoint: NLLB_DEFAULT_OPENROUTER_ENDPOINT,
      model: NLLB_DEFAULT_MODEL,
      separator: NLLB_DEFAULT_SEPARATOR,
      temperature: 0,
      maxOutputTokens: 256,
      timeoutMs: 60_000,
      langMap: {}
    } as INllbConfig
  }

  it('has correct translator name', () => {
    expect(NllbTranslator.name).toBe('nllb')
  })

  it('sends separator-preserving prompt and parses split output', async () => {
    mockFetch.mockReturnValueOnce(createMockResponse('Bonjour\n<<<SEP>>>\nOuvrez le fichier\n<<<SEP>>>\nEnregistrer les modifications'))

    const result = await NllbTranslator.translateMany(
      ['Hello world', 'Open the file', 'Save changes'],
      [null, null, null],
      defaultOpts
    )

    expect(result).toEqual(['Bonjour', 'Ouvrez le fichier', 'Enregistrer les modifications'])

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.model).toBe(NLLB_DEFAULT_MODEL)
    expect(body.max_tokens).toBe(256)
    expect(body.messages[0].content).toContain('Translate from English (eng_Latn) to French (fra_Latn).')
    expect(body.messages[0].content).toContain(`Keep the separator ${NLLB_DEFAULT_SEPARATOR} exactly as is.`)
  })

  it('uses mapped NLLB locale codes from langMap', async () => {
    mockFetch.mockReturnValueOnce(createMockResponse('Hola'))

    const mappedOpts: BulkTranslateOpts<INllbConfig> = {
      ...defaultOpts,
      sourceLocale: 'en-US',
      targetLocale: 'es-ES',
      apiConfig: {
        ...(defaultOpts.apiConfig as INllbConfig),
        langMap: {
          'en-US': 'eng_Latn',
          'es-ES': 'spa_Latn'
        }
      } as INllbConfig
    }

    const result = await NllbTranslator.translateMany(['Hello'], [null], mappedOpts)
    expect(result).toEqual(['Hola'])
  })

  it('uses configured unified model field when provided', async () => {
    mockFetch.mockReturnValueOnce(createMockResponse('Bonjour'))

    const optsWithModel: BulkTranslateOpts<INllbConfig> = {
      ...defaultOpts,
      apiConfig: {
        ...(defaultOpts.apiConfig as INllbConfig),
        model: 'meta-llama/nllb-200-distilled-600M'
      } as INllbConfig
    }

    const result = await NllbTranslator.translateMany(['Hello'], [null], optsWithModel)
    expect(result).toEqual(['Bonjour'])

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.model).toBe('meta-llama/nllb-200-distilled-600M')
  })

  it('throws for missing api key', async () => {
    const opts: BulkTranslateOpts<INllbConfig> = {
      ...defaultOpts,
      apiConfig: {
        endpoint: NLLB_DEFAULT_OPENROUTER_ENDPOINT,
        model: NLLB_DEFAULT_MODEL,
        separator: NLLB_DEFAULT_SEPARATOR,
        temperature: 0,
        maxOutputTokens: 256,
        timeoutMs: 60_000,
        langMap: {}
      } as INllbConfig
    }

    await expect(NllbTranslator.translateMany(['Hello'], [null], opts)).rejects.toThrow(
      "NLLB Translator: missing 'apiKey'"
    )
  })
})
