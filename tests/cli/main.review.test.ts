import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cli/main review options', () => {
  const originalArgv = process.argv

  async function mockFreshCommanderProgram(): Promise<void> {
    vi.doMock('commander', async () => {
      const actual = await vi.importActual<typeof import('commander')>('commander')
      return {
        ...actual,
        program: new actual.Command()
      }
    })
  }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('runs review push and exits when --review-push is provided', async () => {
    process.argv = ['node', 'cli', '/workspace', '--review-push']
    await mockFreshCommanderProgram()

    const mockAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      pushToMateCat: vi.fn().mockResolvedValue(undefined),
      pullFromMateCat: vi.fn(),
      getMateCatReviewStatus: vi.fn(),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      purge: vi.fn(),
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
    expect(mockAdapter.pushToMateCat).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('Human translator review push operation completed. Exiting.')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('runs review pull and exits when --review-pull is provided', async () => {
    process.argv = ['node', 'cli', '/workspace', '--review-pull']
    await mockFreshCommanderProgram()

    const mockAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      pushToMateCat: vi.fn(),
      pullFromMateCat: vi.fn().mockResolvedValue(undefined),
      getMateCatReviewStatus: vi.fn(),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      purge: vi.fn(),
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
    expect(mockAdapter.pullFromMateCat).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('Human translator review pull operation completed. Exiting.')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('prints review status with percent done and exits when --review-status is provided', async () => {
    process.argv = ['node', 'cli', '/workspace', '--review-status']
    await mockFreshCommanderProgram()

    const mockAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      pushToMateCat: vi.fn(),
      pullFromMateCat: vi.fn(),
      getMateCatReviewStatus: vi.fn().mockResolvedValue([
        { projectId: 'project-a', status: 'in_progress', percentDone: 42 },
        { projectId: 'project-b', status: 'completed' }
      ]),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      purge: vi.fn(),
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
    expect(mockAdapter.getMateCatReviewStatus).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('- project-a: 42% done (in_progress)')
    expect(logSpy).toHaveBeenCalledWith('- project-b: 0% done (completed)')
    expect(logSpy).toHaveBeenCalledWith('Human translator review status operation completed. Exiting.')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('prints no pending projects message and exits when --review-status has no projects', async () => {
    process.argv = ['node', 'cli', '/workspace', '--review-status']
    await mockFreshCommanderProgram()

    const mockAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      pushToMateCat: vi.fn(),
      pullFromMateCat: vi.fn(),
      getMateCatReviewStatus: vi.fn().mockResolvedValue([]),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      purge: vi.fn(),
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
    expect(mockAdapter.getMateCatReviewStatus).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('No pending human translator review projects found.')
    expect(logSpy).toHaveBeenCalledWith('Human translator review status operation completed. Exiting.')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
