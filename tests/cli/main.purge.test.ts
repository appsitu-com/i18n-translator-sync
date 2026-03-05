import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cli/main purge option', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    vi.resetModules()
    process.argv = ['node', 'cli', '/workspace', '--purge-cache']
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('runs purge and exits when --purge-cache is provided', async () => {
    const mockAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      purge: vi.fn().mockResolvedValue({ deletedCount: 5, backupPath: '/workspace/translator-20260305-1200.csv' }),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      pushToMateCat: vi.fn(),
      pullFromMateCat: vi.fn(),
      bulkTranslate: vi.fn(),
      start: vi.fn()
    }

    vi.doMock('../../src/cli/cliAdapter', () => ({
      CLITranslatorAdapter: vi.fn().mockImplementation(() => mockAdapter)
    }))

    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: '0.0.0-test' }))
    }))

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { runCli } = await import('../../src/cli/main')
    await runCli()

    expect(mockAdapter.initialize).toHaveBeenCalledTimes(1)
    expect(mockAdapter.purge).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('Purge completed. Deleted 5 unused translations.')
    expect(logSpy).toHaveBeenCalledWith('Backup saved to: /workspace/translator-20260305-1200.csv')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

})
