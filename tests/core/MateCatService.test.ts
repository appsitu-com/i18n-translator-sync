import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMateCatHttpClient, MateCatService, MateCatSettings, loadMateCatSettings } from '../../src/core/MateCatService'
import { ConsoleLogger } from '../../src/core/util/baseLogger'
import type { ILogger } from '../../src/core/util/baseLogger'
import * as fs from 'fs'

// Create mock modules before importing
vi.mock('fs', () => ({
  mkdtempSync: () => '/tmp/matecat-test',
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((p?: string) => {
    if (p?.endsWith('matecat.json')) {
      return '{"newProjectDefaults":{"project_name":"Demo","subject":"general","instructions[]":["one","two"]}}'
    }

    return Buffer.from('test,data\nrow1,value1')
  }),
  existsSync: vi.fn((p?: string) => Boolean(p?.endsWith('matecat.json'))),
}))

vi.mock('os', () => ({
  tmpdir: () => '/tmp'
}))

class FakeCache {
  exportCSV = vi.fn(async (p: string) => {})
  importCSV = vi.fn(async (_p: string) => 2)
}

describe('MateCatService', () => {
  const originalFetch = globalThis.fetch as any
  let mateCatService: MateCatService
  let logger: ConsoleLogger
  let settings: MateCatSettings
  const originalApiKey = process.env.MATECAT_API_KEY

  beforeEach(() => {
    logger = new ConsoleLogger()
    mateCatService = new MateCatService(logger)
    process.env.MATECAT_API_KEY = 'key-secret'

    settings = {
      apiKey: 'key-secret',
      newProjectDefaults: {
        project_name: 'Demo',
        subject: 'general',
        'instructions[]': ['one', 'two']
      }
    }
  })

  afterEach(() => {
    process.env.MATECAT_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  it('loads settings from env and matecat.json', () => {
    const loaded = loadMateCatSettings('/workspace')
    expect(loaded.apiKey).toBe('key-secret')
    expect(loaded.newProjectDefaults.project_name).toBe('Demo')
    expect(loaded.newProjectDefaults.subject).toBe('general')
    expect(loaded.newProjectDefaults['instructions[]']).toEqual(['one', 'two'])
  })

  it('warns and ignores computed/unsupported matecat.json fields', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      '{"newProjectDefaults":{"project_name":"Demo","source_lang":"en-US","unsupported_key":1}}' as any
    )

    const warn = vi.fn()
    const testLogger: ILogger = {
      info: vi.fn(),
      warn,
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }

    const loaded = loadMateCatSettings('/workspace', testLogger)

    expect(loaded.newProjectDefaults.project_name).toBe('Demo')
    expect(loaded.newProjectDefaults.source_lang).toBeUndefined()
    expect((loaded.newProjectDefaults as Record<string, unknown>).unsupported_key).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('pushTmToMateCat posts multipart to fixed /api/v1/new and reports success', async () => {
    const cache = new FakeCache()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return 'ok'
      }
    })

    await expect(
      mateCatService.pushTmToMateCat(
        cache as any,
        settings,
        { source_lang: 'en-US', target_lang: 'fr-FR' }
      )
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://www.matecat.com/api/v1/new')

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    const headers = requestInit.headers as Record<string, string>
    expect(headers['x-matecat-key']).toBe('key-secret')
    expect(requestInit.method).toBe('POST')

    const requestBody = requestInit.body as Buffer
    const requestText = requestBody.toString('utf8')
    expect(requestText).toContain('name="instructions[]"')
    expect(requestText).toContain('one')
    expect(requestText).toContain('two')
  })

  it('throws if required new-project fields are missing', async () => {
    const cache = new FakeCache()
    const invalidSettings: MateCatSettings = {
      apiKey: 'key-secret',
      newProjectDefaults: {
        project_name: 'Demo'
      }
    }

    await expect(mateCatService.pushTmToMateCat(cache as any, invalidSettings)).rejects.toThrow(
      'MateCat push requires a non-empty "source_lang"'
    )
  })

  it('pullReviewedFromMateCat is currently not implemented', async () => {
    const cache = new FakeCache()
    await expect(mateCatService.pullReviewedFromMateCat(cache as any, settings)).rejects.toThrow(
      'MateCat review pull workflow is not implemented yet'
    )
  })

  it('supports interface-only HTTP client injection', async () => {
    const cache = new FakeCache()
    const send = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'ok'
    })
    const httpClient: IMateCatHttpClient = {
      send
    }

    const service = new MateCatService(logger, httpClient)
    await service.pushTmToMateCat(cache as any, settings, {
      source_lang: 'en-US',
      target_lang: 'fr-FR'
    })

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      'https://www.matecat.com/api/v1/new',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
