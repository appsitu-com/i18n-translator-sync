import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTranslatorEnv, resetEnvInitialization } from '../../../src/core/util/environmentSetup'
import type { IFileSystem, IUri } from '../../../src/core/util/fs'
import type { ILogger } from '../../../src/core/util/baseLogger'

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

function createMissingFileSystem(): IFileSystem {
  return {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => false),
    createDirectory: vi.fn(async () => undefined),
    readDirectory: vi.fn(async () => []),
    createUri: (fsPath: string): IUri => ({ fsPath, scheme: 'file', path: fsPath }),
    joinPath: vi.fn((uri: IUri, ...pathSegments: string[]) => ({
      fsPath: [uri.fsPath, ...pathSegments].join('/'),
      scheme: 'file',
      path: [uri.path, ...pathSegments].join('/')
    })),
    stat: vi.fn(async () => ({ size: 0, ctime: 0, mtime: 0 })),
    isDirectory: vi.fn(async () => false)
  }
}

describe('initTranslatorEnv CI behavior', () => {
  const originalCi = process.env.CI
  const originalGithubActions = process.env.GITHUB_ACTIONS

  beforeEach(() => {
    resetEnvInitialization()
    delete process.env.CI
    delete process.env.GITHUB_ACTIONS
  })

  afterEach(() => {
    resetEnvInitialization()

    if (originalCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCi
    }

    if (originalGithubActions === undefined) {
      delete process.env.GITHUB_ACTIONS
    } else {
      process.env.GITHUB_ACTIONS = originalGithubActions
    }
  })

  it('warns about missing translator.env outside CI', async () => {
    const logger = createMockLogger()
    const fs = createMissingFileSystem()

    await initTranslatorEnv('/workspace', logger, fs)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Environment file not found:')
    )
  })

  it('does not emit warning about missing translator.env in CI', async () => {
    process.env.CI = 'true'

    const logger = createMockLogger()
    const fs = createMissingFileSystem()

    await initTranslatorEnv('/workspace', logger, fs)

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Environment file not found:')
    )
  })
})
