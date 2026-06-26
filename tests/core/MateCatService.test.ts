import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMateCatHttpClient, MateCatService, MateCatSettings, loadMateCatSettings } from '../../src/core/review/MateCatService'
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

  it('throws when matecat.json contains non-scalar default values', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      '{"newProjectDefaults":{"project_name":"Demo","subject":{"domain":"general"}}}' as any
    )

    expect(() => loadMateCatSettings('/workspace')).toThrow(/defaults validation failed/)
  })

  it('createReviewProject posts multipart to fixed /api/v1/new and returns project credentials', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return '{"status":"OK","id_project":"p1","project_pass":"pass-1","new_keys":"1"}'
      }
    })

    await expect(
      mateCatService.createReviewProject(
        settings,
        {
          fields: {
            project_name: 'Demo',
            source_lang: 'en-US',
            target_lang: 'fr-FR',
            'instructions[]': ['one', 'two']
          },
          uploads: [
            {
              fieldName: 'files[]',
              fileName: 'review.xliff',
              content: Buffer.from('test,data\nrow1,value1'),
              contentType: 'application/xliff+xml'
            }
          ]
        }
      )
    ).resolves.toEqual({ projectId: 'p1', projectPass: 'pass-1' })
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

  it('pullReviewedTranslations fetches download URLs and files for project IDs', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ urls: ['https://files.example.com/review-1.xliff'] })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '<xliff version="1.2"></xliff>'
      })

    const httpClient: IMateCatHttpClient = {
      send
    }

    const service = new MateCatService(logger, httpClient)
    const result = await service.pullReviewedTranslations(settings, [{ projectId: 'p1', projectPass: 'pass-1' }])

    expect(result).toEqual([
      {
        projectId: 'p1',
        fileName: 'review-1.xliff',
        content: '<xliff version="1.2"></xliff>'
      }
    ])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('checkReviewProjectStatus reads status for project IDs', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            project: {
              id: 'p1',
              password: 'pass-1',
              status: 'completed',
              jobs: []
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            project: {
              id: 'p2',
              password: 'pass-2',
              status: 'in_progress',
              jobs: []
            }
          })
      })

    const httpClient: IMateCatHttpClient = {
      send
    }

    const service = new MateCatService(logger, httpClient)
    const result = await service.checkReviewProjectStatus(settings, [
      { projectId: 'p1', projectPass: 'pass-1' },
      { projectId: 'p2', projectPass: 'pass-2' }
    ])

    expect(result).toEqual([
      { projectId: 'p1', status: 'completed', percentDone: 100 },
      { projectId: 'p2', status: 'in_progress', percentDone: 0 }
    ])
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(
      1,
      'https://www.matecat.com/api/v3/projects/p1/pass-1',
      expect.objectContaining({ method: 'GET' })
    )
    expect(send).toHaveBeenNthCalledWith(
      2,
      'https://www.matecat.com/api/v3/projects/p2/pass-2',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('checkReviewProjectStatus uses job chunk stats to compute percent done', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          project: {
            id: 'p1',
            password: 'pass-1',
            jobs: [
              {
                id: 'job-1',
                password: 'pass-1',
                status: 'active',
                chunks: [
                  {
                    status: 'active',
                    stats: {
                      raw: {
                        new: 10,
                        draft: 10,
                        translated: 40,
                        approved: 20,
                        approved2: 20,
                        total: 100
                      }
                    }
                  }
                ]
              }
            ]
          }
        })
    })

    const httpClient: IMateCatHttpClient = { send }
    const service = new MateCatService(logger, httpClient)

    const result = await service.checkReviewProjectStatus(settings, [{ projectId: 'p1', projectPass: 'pass-1' }])

    expect(result).toEqual([{ projectId: 'p1', status: 'active', percentDone: 80 }])
    expect(send).toHaveBeenNthCalledWith(
      1,
      'https://www.matecat.com/api/v3/projects/p1/pass-1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('checkReviewProjectStatus prefers chunk status over top-level analysis DONE', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        status: 'DONE',
        jobs: [
          {
            chunks: [
              { status: 'active' }
            ]
          }
        ]
      })
    })

    const httpClient: IMateCatHttpClient = { send }
    const service = new MateCatService(logger, httpClient)

    const result = await service.checkReviewProjectStatus(settings, [
      { projectId: 'p1', projectPass: 'pass-1' }
    ])

    expect(result).toEqual([
      { projectId: 'p1', status: 'active', percentDone: 0 }
    ])
  })

  it('checkReviewProjectStatus maps top-level DONE to analysis_done when chunk statuses are missing', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ status: 'DONE' })
    })

    const httpClient: IMateCatHttpClient = { send }
    const service = new MateCatService(logger, httpClient)

    const result = await service.checkReviewProjectStatus(settings, [
      { projectId: 'p1', projectPass: 'pass-1' }
    ])

    expect(result).toEqual([
      { projectId: 'p1', status: 'analysis_done', percentDone: 0 }
    ])
  })

  it('checkReviewProjectStatus computes partial percent from mixed chunk states', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        status: 'DONE',
        jobs: [
          {
            chunks: [{ status: 'done' }, { status: 'active' }]
          }
        ]
      })
    })

    const httpClient: IMateCatHttpClient = { send }
    const service = new MateCatService(logger, httpClient)

    const result = await service.checkReviewProjectStatus(settings, [
      { projectId: 'p1', projectPass: 'pass-1' }
    ])

    expect(result).toEqual([
      { projectId: 'p1', status: 'in_progress', percentDone: 50 }
    ])
  })

  it('supports interface-only HTTP client injection', async () => {
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
    await service.createReviewProject(settings, {
      fields: {
        project_name: 'Demo',
        source_lang: 'en-US',
        target_lang: 'fr-FR'
      },
      uploads: [
        {
          fieldName: 'files[]',
          fileName: 'review.tmx',
          content: Buffer.from('test,data\nrow1,value1'),
          contentType: 'application/tmx+xml'
        }
      ]
    })

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      'https://www.matecat.com/api/v1/new',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('deleteReviewProject sends POST to v3 projects delete endpoint', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ status: 'OK' })
    })

    const httpClient: IMateCatHttpClient = { send }
    const service = new MateCatService(logger, httpClient)

    await service.deleteReviewProject(settings, { projectId: 'p-delete', projectPass: 'pass-delete' })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      'https://www.matecat.com/api/v3/projects/p-delete/pass-delete/delete',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
