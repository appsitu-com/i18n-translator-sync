import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cli/index', () => {
  let mockRunCli: ReturnType<typeof vi.fn>
  let mockExit: any
  let mockError: any

  beforeEach(() => {
    vi.resetModules()

    // Create fresh mocks for each test
    mockRunCli = vi.fn()
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('should call runCli from main module', async () => {
    mockRunCli.mockResolvedValue(undefined)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module which should execute runCli
    await import('../../src/cli/index')

    // Wait a tick for the promise to resolve
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockExit).not.toHaveBeenCalled()
    expect(mockError).not.toHaveBeenCalled()
  })

  it('should handle Error instances with message and stack', async () => {
    const error = new Error('Test error message')
    error.stack = 'Error: Test error message\n    at test.js:1:1'

    mockRunCli.mockRejectedValue(error)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module
    await import('../../src/cli/index')

    // Wait for the error handling
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockError).toHaveBeenCalledWith('Fatal error: Test error message')
    expect(mockError).toHaveBeenCalledWith(error.stack)
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should handle Error instances without stack', async () => {
    const error = new Error('Test error without stack')
    delete error.stack

    mockRunCli.mockRejectedValue(error)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module
    await import('../../src/cli/index')

    // Wait for the error handling
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockError).toHaveBeenCalledWith('Fatal error: Test error without stack')
    expect(mockError).toHaveBeenCalledTimes(1) // No stack printed
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should handle non-Error objects', async () => {
    const error = 'String error'

    mockRunCli.mockRejectedValue(error)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module
    await import('../../src/cli/index')

    // Wait for the error handling
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockError).toHaveBeenCalledWith('Fatal error: String error')
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should handle null/undefined errors', async () => {
    mockRunCli.mockRejectedValue(null)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module
    await import('../../src/cli/index')

    // Wait for the error handling
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockError).toHaveBeenCalledWith('Fatal error: null')
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should handle object errors', async () => {
    const error = { code: 'CUSTOM_ERROR', message: 'Custom error object' }

    mockRunCli.mockRejectedValue(error)

    vi.doMock('../../src/cli/main', () => ({
      runCli: mockRunCli
    }))

    // Import the index module
    await import('../../src/cli/index')

    // Wait for the error handling
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunCli).toHaveBeenCalledOnce()
    expect(mockError).toHaveBeenCalledWith('Fatal error: [object Object]')
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})