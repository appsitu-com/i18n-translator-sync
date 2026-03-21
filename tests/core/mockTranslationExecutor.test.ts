import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MockTranslationExecutor } from '../../src/core/mockTranslationExecutor'
import { TranslatorPipeline } from '../../src/core/pipeline'
import { TranslatorManager } from '../../src/core/translatorManager'
import { Logger } from '../../src/core/util/baseLogger'
import { TranslationCache } from '../../src/core/cache/sqlite'
import { TranslateProjectConfig, ConfigProvider, defaultConfig } from '../../src/core/coreConfig'

// Mock dependencies
vi.mock('../../src/core/cache/sqlite')
vi.mock('../../src/core/util/watcher')

describe('MockTranslationExecutor - Dry Run Functionality', () => {
  let mockExecutor: MockTranslationExecutor
  let mockLogger: Logger
  let mockCache: TranslationCache
  let mockFs: any
  let pipeline: TranslatorPipeline

  beforeEach(() => {
    // Track files that have been "written" by the mock system
    const writtenFiles = new Set<string>()

    // Create mock file system that tracks written files
    mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn().mockImplementation(async (uri: any, content: string) => {
        // Track that this file has been written
        const path = uri.fsPath || uri
        console.log(`writeFile called for: ${path}`)
        writtenFiles.add(path)
      }),
      fileExists: vi.fn().mockImplementation(async (uri: any) => {
        const path = uri.fsPath || uri
        // Source files exist, written files exist, others don't
        if (path.includes('/en/') || path.includes('\\en\\')) {
          console.log(`fileExists(${path}) = true (source file)`)
          return true // Source files exist
        }
        const exists = writtenFiles.has(path)
        console.log(`fileExists(${path}) = ${exists} (written=${writtenFiles.has(path)})`)
        return exists // Files exist if they've been written
      }),
      stat: vi.fn(),
      createDirectory: vi.fn(),
      joinPath: vi.fn((base: any, ...parts: string[]) => ({
        fsPath: [base.fsPath || base, ...parts].join('/').replace(/\/+/g, '/')
      })),
      createUri: (path: string) => ({ fsPath: path })
    }

    mockExecutor = new MockTranslationExecutor(mockFs)
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    } as unknown as Logger
    mockCache = {} as TranslationCache

    pipeline = new TranslatorPipeline(mockFs, mockLogger, mockCache, '/test/workspace', mockExecutor)
  })

  describe('Translation Command Capture', () => {
    it('should capture translation commands without executing them', async () => {
      // Mock file system to return a JSON file
      const mockFileContent = JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'fileExists').mockResolvedValue(false) // Force translation needed
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr', 'es'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'copy' as any,
        defaultMarkdownEngine: 'copy' as any,
        engineOverrides: {},
        enableBackTranslation: false
      }

      const sourceUri = mockFs.createUri('/workspace/i18n/en/messages.json')

      // Process the file
      await pipeline.processFile(sourceUri, '/workspace', config, undefined)

      // Verify translation commands were captured
      expect(mockExecutor.commands.length).toBe(4) // 2 translations + 2 writes
      expect(mockExecutor.translationCommands.length).toBe(2) // en->fr, en->es
      expect(mockExecutor.writeCommands.length).toBe(2) // 2 output files

      // Verify translation pairs
      const pairs = mockExecutor.translationPairs
      expect(pairs).toHaveLength(2)
      expect(pairs[0]).toMatchObject({
        source: 'en',
        target: 'fr',
        engine: 'copy',
        isBackTranslation: false,
        sourceFile: sourceUri.fsPath
      })
      expect(pairs[1]).toMatchObject({
        source: 'en',
        target: 'es',
        engine: 'copy',
        isBackTranslation: false,
        sourceFile: sourceUri.fsPath
      })
    })

    it('should capture back-translation commands when enabled', async () => {
      const mockFileContent = JSON.stringify({ greeting: 'Hello' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'google' as any,
        defaultMarkdownEngine: 'google' as any,
        engineOverrides: {},
        enableBackTranslation: true
      }

      const sourceUri = mockFs.createUri('/workspace/i18n/en/messages.json')

      await pipeline.processFile(sourceUri, '/workspace', config, undefined)

      // Debug: Log actual commands captured
      console.log('Commands captured:', mockExecutor.commands.length)
      console.log('Commands:', mockExecutor.commands.map(cmd => ({ type: cmd.type, sourceLocale: cmd.sourceLocale, targetLocale: cmd.targetLocale })))

      // Should have 4 commands: forward translation + write + back translation + write
      expect(mockExecutor.commands.length).toBe(4)

      const pairs = mockExecutor.translationPairs
      expect(pairs).toHaveLength(2)

      // Forward translation
      expect(pairs[0]).toMatchObject({
        source: 'en',
        target: 'fr',
        isBackTranslation: false
      })

      // Back translation
      expect(pairs[1]).toMatchObject({
        source: 'fr',
        target: 'en',
        isBackTranslation: true
      })
    })

    it('should provide a comprehensive summary of planned translations', async () => {
      const mockFileContent = JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'fileExists').mockResolvedValue(false)
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr', 'es'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'google' as any,
        defaultMarkdownEngine: 'google' as any,
        engineOverrides: {},
        enableBackTranslation: true
      }

      const sourceUri = mockFs.createUri('/workspace/i18n/en/messages.json')

      await pipeline.processFile(sourceUri, '/workspace', config, undefined)

      const summary = mockExecutor.getSummary()

      // Debug: Log actual summary
      console.log('Summary translation pairs:', summary.translationPairs)

      expect(summary.totalTranslations).toBe(4) // en->fr, en->es, fr->en, es->en
      expect(summary.totalWrites).toBe(4) // 4 output files
      expect(summary.uniqueSourceFiles).toBe(1)
      expect(summary.translationPairs.length).toBe(4)
      expect(summary.targetFiles.length).toBe(4)

      // Check that translation pairs include engine information
      expect(summary.translationPairs).toContain(
        '/workspace/i18n/en/messages.json: en → fr (google)'
      )
      expect(summary.translationPairs).toContain(
        '/workspace/i18n/en/messages.json: fr → en (google) [back]'
      )
    })
  })

  describe('File Collection Planning', () => {
    it('should capture translation commands for multiple files', async () => {
      const mockFileContent = JSON.stringify({ key: 'value' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'fileExists').mockResolvedValue(false)
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'copy' as any,
        defaultMarkdownEngine: 'copy' as any,
        engineOverrides: {},
        enableBackTranslation: false
      }

      // Process multiple files
      const files = [
        '/workspace/i18n/en/messages.json',
        '/workspace/i18n/en/errors.json',
        '/workspace/i18n/en/labels.json'
      ]

      for (const filePath of files) {
        const sourceUri = mockFs.createUri(filePath)
        await pipeline.processFile(sourceUri, '/workspace', config, undefined)
      }

      // Verify all files are captured
      expect(mockExecutor.commands.length).toBe(6) // 3 files × (1 translation + 1 write)

      const uniqueFiles = new Set(mockExecutor.commands.map(cmd => cmd.sourceFile))
      expect(uniqueFiles.size).toBe(3)
      expect(Array.from(uniqueFiles)).toEqual(expect.arrayContaining(files))
    })

    it('should filter commands by source file', async () => {
      const mockFileContent = JSON.stringify({ key: 'value' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'fileExists').mockResolvedValue(false)
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr', 'es'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'copy' as any,
        defaultMarkdownEngine: 'copy' as any,
        engineOverrides: {},
        enableBackTranslation: false
      }

      // Process two files
      const file1 = '/workspace/i18n/en/messages.json'
      const file2 = '/workspace/i18n/en/errors.json'

      await pipeline.processFile(mockFs.createUri(file1), '/workspace', config, undefined)
      await pipeline.processFile(mockFs.createUri(file2), '/workspace', config, undefined)

      // Filter commands for specific file
      const file1Commands = mockExecutor.getCommandsForFile(file1)
      const file2Commands = mockExecutor.getCommandsForFile(file2)

      expect(file1Commands.length).toBe(4) // 2 translations + 2 writes (en->fr, en->es)
      expect(file2Commands.length).toBe(4) // 2 translations + 2 writes (en->fr, en->es)

      // Verify all commands are for the correct source file
      file1Commands.forEach(cmd => expect(cmd.sourceFile).toBe(file1))
      file2Commands.forEach(cmd => expect(cmd.sourceFile).toBe(file2))
    })
  })

  describe('Integration with TranslatorManager', () => {
    it('should work with TranslatorManager for bulk translation planning', async () => {
      const mockFileContent = JSON.stringify({ greeting: 'Hello' })
      vi.spyOn(mockFs, 'readFile').mockResolvedValue(mockFileContent)
      vi.spyOn(mockFs, 'fileExists').mockResolvedValue(true)
      vi.spyOn(mockFs, 'stat').mockResolvedValue({ mtime: Date.now() } as any)

      // Mock workspace watcher
      const mockWatcher = {
        createFileSystemWatcher: vi.fn().mockReturnValue({
          watch: vi.fn(),
          dispose: vi.fn()
        }),
        onDidRenameFiles: vi.fn()
      }

      const configProvider: ConfigProvider = {
        get: vi.fn().mockReturnValue({}),
        update: vi.fn()
      }

      // Create TranslatorManager with mock executor
      const managerMockExecutor = new MockTranslationExecutor(mockFs)
      const manager = new TranslatorManager(
        mockFs,
        mockLogger,
        mockCache,
        '/workspace',
        mockWatcher as any,
        configProvider,
        managerMockExecutor,
        undefined,
        undefined
      )

      const config: TranslateProjectConfig = {
        ...defaultConfig,
        sourceDir: '',
        targetDir: '',
        sourceLocale: 'en',
        targetLocales: ['fr'],
        sourcePaths: ['i18n/en'],
        defaultJsonEngine: 'copy' as any,
        defaultMarkdownEngine: 'copy' as any,
        engineOverrides: {},
        enableBackTranslation: false
      }

      const sourceUri = mockFs.createUri('/workspace/i18n/en/messages.json')

      // Translate a single file through the manager
      await manager.translateSingleFile(sourceUri, config, true) // force=true

      // Verify the translation was planned but not executed
      expect(managerMockExecutor.commands.length).toBe(2) // 1 translation + 1 write
      expect(managerMockExecutor.translationPairs).toHaveLength(1)
      expect(managerMockExecutor.targetFiles).toHaveLength(1)

      const summary = managerMockExecutor.getSummary()
      expect(summary.totalTranslations).toBe(1)
      expect(summary.totalWrites).toBe(1)
      expect(summary.translationPairs[0]).toContain('en → fr (copy)')
    })
  })
})