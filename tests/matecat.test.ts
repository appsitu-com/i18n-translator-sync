import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pushCacheToMateCat, pullReviewedFromMateCat } from '../src/matecate'
import { workspace } from './mocks/vscode'
import * as path from 'path'

// Create mock modules before importing
vi.mock('fs', () => ({
  mkdtempSync: () => '/tmp/matecat-test',
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('test,data\nrow1,value1')),
}))

vi.mock('os', () => ({
  tmpdir: () => '/tmp'
}))

class FakeCache {
  exportCSV = vi.fn(async (p: string) => {})
  importCSV = vi.fn(async (_p: string) => 2)
}

describe('matecat', () => {
  const originalFetch = globalThis.fetch as any

  beforeEach(() => {
    ;(workspace.getConfiguration as any).mockReturnValue({
      get: (k: string, d: any) => {
        const m: any = {
          matecat: {
            pushUrl: 'https://example.test/api/projects/{projectId}/files',
            pullUrl: 'https://example.test/api/projects/{projectId}/files/reviewed',
            apiKey: 'TESTKEY',
            projectId: 'P1'
          }
        }
        return m[k] ?? d
      }
    })
  })

  it('pushCacheToMateCat posts multipart and reports success', async () => {
    const cache = new FakeCache()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return 'ok'
      }
    })

    await expect(pushCacheToMateCat(cache as any)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('pullReviewedFromMateCat downloads CSV and imports', async () => {
    const cache = new FakeCache()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      async arrayBuffer() {
        return new TextEncoder().encode('engine_name,...\n').buffer
      }
    })

    const n = await pullReviewedFromMateCat(cache as any)
    expect(n).toBe(2)
    expect(cache.importCSV).toHaveBeenCalledOnce()
    // restore
    global.fetch = originalFetch
  })
})
