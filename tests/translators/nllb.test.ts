import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NllbTranslator } from '../../src/translators/nllb'
import type { BulkTranslateOpts } from '../../src/translators/types'
import type { INllbConfig } from '../../src/core/config'

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

  const defaultOpts: BulkTranslateOpts = {
    sourceLocale: 'en',
    targetLocale: 'fr',
    rootDir: '.',
    apiConfig: {
      apiKey: 'test-api-key',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions'
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
    expect(body.model).toBe('meta-llama/nllb-200-1.3B')
    expect(body.messages[0].content).toContain('Translate from English (eng_Latn) to French (fra_Latn).')
    expect(body.messages[0].content).toContain('Keep the separator <<<SEP>>> exactly as is.')
  })

  it('uses mapped NLLB locale codes from langMap', async () => {
    mockFetch.mockReturnValueOnce(createMockResponse('Hola'))

    const mappedOpts: BulkTranslateOpts = {
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

  it('throws for missing api key', async () => {
    const opts: BulkTranslateOpts = {
      ...defaultOpts,
      apiConfig: { endpoint: 'https://openrouter.ai/api/v1/chat/completions' } as INllbConfig
    }

    await expect(NllbTranslator.translateMany(['Hello'], [null], opts)).rejects.toThrow(
      "NLLB Translator: missing 'apiKey'"
    )
  })
})
