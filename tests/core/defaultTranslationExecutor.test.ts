import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DefaultTranslationExecutor } from '../../src/core/defaultTranslationExecutor'
import { FileSystem, IUri } from '../../src/core/util/fs'
import { Logger } from '../../src/core/util/baseLogger'
import { TranslationCache } from '../../src/core/cache/sqlite'

describe('defaultTranslationExecutor', () => {
  let executor: DefaultTranslationExecutor
  let mockFileSystem: FileSystem
  let mockLogger: Logger
  let mockCache: TranslationCache

  beforeEach(() => {
    // Create mock file system
    mockFileSystem = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn(),
      readDirectory: vi.fn(),
      createDirectory: vi.fn(),
      createUri: vi.fn(),
      joinPath: vi.fn(),
      stat: vi.fn()
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
      getMany: vi.fn(),
      putMany: vi.fn(),
      exportCSV: vi.fn(),
      importCSV: vi.fn(),
      close: vi.fn()
    }

    executor = new DefaultTranslationExecutor(mockFileSystem, mockLogger, mockCache)
  })

  describe('constructor', () => {
    it('should create instance with provided dependencies', () => {
      expect(executor).toBeInstanceOf(DefaultTranslationExecutor)
    })
  })

  describe('writeTranslation', () => {
    it('should create directory and write file', async () => {
      const targetUri: IUri = {
        fsPath: '/test/output/file.json',
        path: '/test/output/file.json',
        scheme: 'file'
      }
      const content = '{"hello": "bonjour"}'

      // Mock path operations
      mockFileSystem.joinPath = vi.fn().mockReturnValue({
        fsPath: '/test/output',
        path: '/test/output',
        scheme: 'file'
      })

      await executor.writeTranslation(targetUri, content, '/test/input.json', false)

      expect(mockFileSystem.createDirectory).toHaveBeenCalled()
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(targetUri, content)
    })

    it('should handle write errors', async () => {
      const targetUri: IUri = {
        fsPath: '/test/output/file.json',
        path: '/test/output/file.json',
        scheme: 'file'
      }

      mockFileSystem.writeFile = vi.fn().mockRejectedValue(new Error('Write failed'))

      await expect(
        executor.writeTranslation(targetUri, '{}', '/test/input.json', false)
      ).rejects.toThrow('Write failed')
    })
  })

  // Note: translateSegments test is omitted due to complex dependency mocking
  // The method involves bulkTranslateWithEngine which has many internal dependencies
  // In a real implementation, this would be integration tested or the dependencies
  // would be injected to allow for easier mocking
})