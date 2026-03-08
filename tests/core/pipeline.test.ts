import * as path from 'path'
import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest'
import { TranslatorPipeline } from '../../src/core/pipeline'
import { MockTranslationExecutor } from '../../src/core/mockTranslationExecutor'
import { TranslateProjectConfig } from '../../src/core/coreConfig'
import { registerAllTranslators } from '../../src/translators/translatorRegistry'
import { IPassphraseManager } from '../../src/core/secrets/passphraseManager'

describe('TranslatorPipeline', () => {
  let pipeline: TranslatorPipeline
  let mockFs: any
  let mockLogger: any
  let mockCache: any
  let mockExecutor: MockTranslationExecutor
  let mockPassphraseManager: IPassphraseManager
  let config: TranslateProjectConfig

  beforeEach(() => {
    // Register translators for the tests
    registerAllTranslators()

    // Create mock file system
    mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn().mockResolvedValue(false), // Default to file not existing (needs translation)
      fileExistsSync: vi.fn().mockReturnValue(true),
      directoryExistsSync: vi.fn().mockReturnValue(true),
      readDirectory: vi.fn(),
      createDirectory: vi.fn(),
      createUri: vi.fn(path => ({ fsPath: path, path, scheme: 'file' })),
      joinPath: vi.fn((base, ...paths) => ({
        fsPath: `${base.fsPath}/${paths.join('/')}`,
        path: `${base.path}/${paths.join('/')}`,
        scheme: 'file'
      })),
      stat: vi.fn().mockResolvedValue({ mtime: Date.now() })
    }

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }

    // Create mock cache
    mockCache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {}),
      exportCSV: vi.fn(async () => {}),
      importCSV: vi.fn(async () => 0),
      hasSourcePath: vi.fn(async () => true),
      hasPendingPurge: vi.fn(async () => false),
      close: vi.fn(() => {})
    }

    // Create mock executor
    mockExecutor = new MockTranslationExecutor(mockFs)

    mockPassphraseManager = {
      loadPassphrase: vi.fn().mockResolvedValue(undefined),
      setPassphrase: vi.fn(),
      getPassphrase: vi.fn().mockReturnValue('secret'),
      hasPassphrase: vi.fn().mockReturnValue(false)
    }

    // Test configuration
    config = {
      sourceDir: '',
      targetDir: '',
      sourcePaths: ['i18n/en'],
      sourceLocale: 'en',
      targetLocales: ['fr-FR'],
      enableBackTranslation: true,
      defaultMarkdownEngine: 'copy',
      defaultJsonEngine: 'copy',
      engineOverrides: {}
    }

    // Create pipeline instance with mock executor
    pipeline = new TranslatorPipeline(mockFs, mockLogger, mockCache, '/test/workspace', mockExecutor, mockPassphraseManager)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('processes forward and back translations for JSON', async () => {
    // Mock file content
    const jsonContent = JSON.stringify({ a: 'x' })
    mockFs.readFile.mockResolvedValueOnce(jsonContent)

    const src = mockFs.createUri('/ws/i18n/en/demo.json')
    const configProvider = { get: vi.fn().mockReturnValue('copy') }

    const translateSpy = vi.spyOn(mockExecutor, 'translateSegments')

    await pipeline.processFile(src, '/ws', config, configProvider, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    // Should have 2 write commands: forward and back translation
    expect(mockExecutor.writeCommands).toHaveLength(2)
    // Should also write to filesystem through executor
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2)

    // Passphrase should be forwarded to executor calls
    expect(mockPassphraseManager.loadPassphrase).toHaveBeenCalled()
    const passphrases = translateSpy.mock.calls.map((call) => call[8])
    expect(passphrases.length).toBeGreaterThan(0)
    passphrases.forEach((value) => expect(value).toBe('secret'))
  })

  it('processes forward and back translations for YAML', async () => {
    // Mock file content
    const yamlContent = 'a: x\nb: y'
    mockFs.readFile.mockResolvedValueOnce(yamlContent)

    const src = mockFs.createUri('/ws/i18n/en/demo.yaml')
    const configProvider = { get: vi.fn().mockReturnValue('copy') }

    await pipeline.processFile(src, '/ws', config, configProvider, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    // Should have 2 write commands: forward and back translation
    expect(mockExecutor.writeCommands).toHaveLength(2)
    // Should also write to filesystem through executor
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
  })

  it('processes forward and back translations for YML', async () => {
    // Mock file content
    const yamlContent = 'a: x\nb: y'
    mockFs.readFile.mockResolvedValueOnce(yamlContent)

    const src = mockFs.createUri('/ws/i18n/en/demo.yml')
    const configProvider = { get: vi.fn().mockReturnValue('copy') }

    await pipeline.processFile(src, '/ws', config, configProvider, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    // Should have 2 write commands: forward and back translation
    expect(mockExecutor.writeCommands).toHaveLength(2)
    // Should also write to filesystem through executor
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
  })

  it('removes forward and back files and prunes directories', async () => {
    const src = mockFs.createUri('/ws/i18n/en/demo.json')
    mockFs.readDirectory.mockResolvedValue([]) // Empty directories for pruning

    await pipeline.removeFile(src, '/ws', config)

    // Should delete forward and back translation files
    expect(mockFs.deleteFile).toHaveBeenCalledTimes(2)
  })
})

describe('TranslatorPipeline - pruneEmptyDirs', () => {
  let pipeline: TranslatorPipeline
  let mockFs: any
  let mockLogger: any
  let mockCache: any

  const root = { fsPath: '/ws/i18n/fr-FR', path: '/ws/i18n/fr-FR', scheme: 'file' }
  const relPath = 'foo/bar/baz.txt'

  beforeEach(() => {
    mockFs = {
      joinPath: vi.fn((base, ...paths) => ({
        fsPath: `${base.fsPath}/${paths.join('/')}`,
        path: `${base.path}/${paths.join('/')}`,
        scheme: 'file'
      })),
      readDirectory: vi.fn(),
      deleteFile: vi.fn()
    }

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }

    mockCache = {
      getMany: vi.fn(),
      putMany: vi.fn(),
      exportCSV: vi.fn(),
      importCSV: vi.fn(),
      close: vi.fn()
    }

    pipeline = new TranslatorPipeline(mockFs, mockLogger, mockCache, '/test/workspace')
    vi.clearAllMocks()
  })

  it('prunes all empty directories up to root', async () => {
    // All directories are empty
    mockFs.readDirectory
      .mockResolvedValueOnce([]) // bar
      .mockResolvedValueOnce([]) // foo

    await pipeline.pruneEmptyDirs(root, relPath)

    expect(mockFs.deleteFile).toHaveBeenCalledTimes(2)
  })

  it('stops pruning at first non-empty directory', async () => {
    // bar is empty, foo is not
    mockFs.readDirectory
      .mockResolvedValueOnce([]) // bar
      .mockResolvedValueOnce([['file.txt', 1]]) // foo not empty

    await pipeline.pruneEmptyDirs(root, relPath)

    expect(mockFs.deleteFile).toHaveBeenCalledTimes(1)
  })

  it('handles non-existent directories gracefully', async () => {
    // bar does not exist
    mockFs.readDirectory.mockRejectedValueOnce(new Error('not found'))

    await pipeline.pruneEmptyDirs(root, relPath)

    expect(mockFs.deleteFile).not.toHaveBeenCalled()
  })
})

describe('TranslatorPipeline translation trigger conditions', () => {
  const workspacePath = '/ws'
  const srcPath = '/ws/i18n/en/demo.json'

  const config: TranslateProjectConfig = {
    sourceDir: '',
    targetDir: '',
    sourcePaths: ['i18n/en'],
    sourceLocale: 'en',
    targetLocales: ['fr-FR'],
    enableBackTranslation: false,
    defaultMarkdownEngine: 'copy',
    defaultJsonEngine: 'copy',
    engineOverrides: {}
  }

  const configProvider = { get: vi.fn().mockReturnValue('copy') }

  function createStatAwareFileSystem(): any {
    return {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ title: 'Hello' })),
      writeFile: vi.fn().mockResolvedValue(undefined),
      fileExists: vi.fn().mockResolvedValue(true),
      readDirectory: vi.fn(),
      createDirectory: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn(),
      createUri: vi.fn((p: string) => ({ fsPath: p, path: p, scheme: 'file' })),
      joinPath: vi.fn((base, ...paths) => {
        const rawBase = typeof base === 'string' ? base : base.fsPath
        const normalizedBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
        const joined = `${normalizedBase}/${paths.join('/')}`
        return { fsPath: joined, path: joined, scheme: 'file' }
      }),
      stat: vi.fn((uri: any) => {
        if (uri.fsPath.includes('/i18n/en/')) {
          return Promise.resolve({ mtime: new Date('2026-01-01T00:00:00Z') })
        }
        return Promise.resolve({ mtime: new Date('2026-01-02T00:00:00Z') })
      })
    }
  }

  function createLogger(): any {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }
  }

  it('translates when source file path is not in cache even if target is newer', async () => {
    const fs = createStatAwareFileSystem()
    const logger = createLogger()
    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {}),
      exportCSV: vi.fn(async () => {}),
      importCSV: vi.fn(async () => 0),
      hasSourcePath: vi.fn(async () => false),
      hasPendingPurge: vi.fn(async () => false),
      close: vi.fn()
    }
    const executor = new MockTranslationExecutor(fs)
    const pipeline = new TranslatorPipeline(fs, logger, cache as any, '/test/workspace', executor)

    await pipeline.processFile(fs.createUri(srcPath), workspacePath, config, configProvider, false)

    expect(executor.translationCommands.length).toBe(1)
  })

  it('translates when purge is pending even if target is newer', async () => {
    const fs = createStatAwareFileSystem()
    const logger = createLogger()
    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {}),
      exportCSV: vi.fn(async () => {}),
      importCSV: vi.fn(async () => 0),
      hasSourcePath: vi.fn(async () => true),
      hasPendingPurge: vi.fn(async () => true),
      close: vi.fn()
    }
    const executor = new MockTranslationExecutor(fs)
    const pipeline = new TranslatorPipeline(fs, logger, cache as any, '/test/workspace', executor)

    await pipeline.processFile(fs.createUri(srcPath), workspacePath, config, configProvider, false)

    expect(executor.translationCommands.length).toBe(1)
  })

  it('translates when source file is newer than target file', async () => {
    const fs = createStatAwareFileSystem()
    fs.stat = vi.fn((uri: any) => {
      if (uri.fsPath.includes('/i18n/en/')) {
        return Promise.resolve({ mtime: new Date('2026-01-03T00:00:00Z') })
      }
      return Promise.resolve({ mtime: new Date('2026-01-02T00:00:00Z') })
    })

    const logger = createLogger()
    const cache = {
      getMany: vi.fn(async () => new Map()),
      putMany: vi.fn(async () => {}),
      exportCSV: vi.fn(async () => {}),
      importCSV: vi.fn(async () => 0),
      hasSourcePath: vi.fn(async () => true),
      hasPendingPurge: vi.fn(async () => false),
      close: vi.fn()
    }
    const executor = new MockTranslationExecutor(fs)
    const pipeline = new TranslatorPipeline(fs, logger, cache as any, '/test/workspace', executor)

    await pipeline.processFile(fs.createUri(srcPath), workspacePath, config, configProvider, false)

    expect(executor.translationCommands.length).toBe(1)
  })
})