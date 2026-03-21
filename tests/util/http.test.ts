import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { postJson } from '../../src/util/http'

const originalFetch = globalThis.fetch as any

describe('http', () => {
  beforeEach(() => {
    // @ts-expect-error
    global.fetch = vi.fn(async (url: string, init: any) => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async text() {
          return JSON.stringify({ echo: init.body ? JSON.parse(init.body) : null })
        }
      } as any
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('postJson sends JSON and parses response', async () => {
    const res = await postJson<any>('http://fake', { hello: 'world' }, { Authorization: 'token' })
    expect(res.echo.hello).toBe('world')
  })

  it('throws on non-ok response', async () => {
    // @ts-expect-error
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Fail',
      async text() {
        return 'err'
      }
    }))
    await expect(postJson('http://fake', {})).rejects.toThrow(/HTTP 500/)
  })
})
