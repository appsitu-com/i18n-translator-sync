import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRANSLATOR_JSON } from '../../src/core/constants'
import { loadProjectConfig, defaultConfig, TranslateConfigSchema, type ConfigProvider, type TranslateProjectConfig } from '../../src/core/coreConfig'
import { FileSystem, IUri } from '../../src/core/util/fs'
import { Logger } from '../../src/core/util/baseLogger'

// Mock modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}))

describe('Config', () => {
  let mockLogger: Logger
  let mockFileSystem: FileSystem
  let mockConfigProvider: ConfigProvider

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }

    // Create mock file system
    mockFileSystem = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(),
      createUri: vi.fn().mockImplementation((fsPath: string): IUri => ({
        fsPath,
        scheme: 'file',
        path: fsPath
      })),
      joinPath: vi.fn(),
      stat: vi.fn()
    }

    // Create mock config provider
    mockConfigProvider = {
      get: vi.fn().mockImplementation((section: string, defaultValue: any) => defaultValue),
      update: vi.fn()
    }
  })

  describe('TranslateConfigSchema', () => {
    it('should validate a complete valid configuration', () => {
      const validConfig = {
        sourceDir: 'src/i18n',
        targetDir: 'dist/i18n',
        sourcePaths: ['en/messages.json', 'en/ui.json'],
        sourceLocale: 'en',
        targetLocales: ['fr', 'es', 'de'],
        enableBackTranslation: true,
        defaultMarkdownEngine: 'azure' as const,
        defaultJsonEngine: 'google' as const,
        engineOverrides: {
          'deepl': ['fr', 'de'],
          'google': ['es']
        }
      }

      const result = TranslateConfigSchema.safeParse(validConfig)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          ...validConfig,
          excludeKeys: [],
          excludeKeyPaths: [],
          copyOnlyFiles: [],
          csvExportPath: 'translator.csv',
          autoExport: true
        })
      }
    })

    it('should validate a minimal valid configuration', () => {
      const minimalConfig = {
        sourceDir: '',
        targetDir: '',
        sourcePaths: ['i18n/en'],
        sourceLocale: 'en',
        targetLocales: ['fr'],
        enableBackTranslation: false,
        defaultMarkdownEngine: 'azure',
        defaultJsonEngine: 'azure',
        engineOverrides: {}
      }

      const result = TranslateConfigSchema.safeParse(minimalConfig)
      expect(result.success).toBe(true)
    })

    it('should reject invalid engine names', () => {
      const invalidConfig = {
        defaultMarkdownEngine: 'invalidEngine'
      }

      const result = TranslateConfigSchema.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject invalid types', () => {
      const invalidConfig = {
        sourceLocale: 123, // should be string
        targetLocales: 'not-an-array', // should be array
        enableBackTranslation: 'true' // should be boolean
      }

      const result = TranslateConfigSchema.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })
  })

  describe('defaultConfig', () => {
    it('should have expected default values', () => {
      expect(defaultConfig).toEqual({
        sourceDir: '',
        targetDir: '',
        sourcePaths: ['i18n/en'],
        sourceLocale: 'en',
        targetLocales: [],
        enableBackTranslation: false,
        defaultMarkdownEngine: 'azure',
        defaultJsonEngine: 'google',
        engineOverrides: {},
        excludeKeys: [],
        excludeKeyPaths: [],
        copyOnlyFiles: [],
        csvExportPath: 'translator.csv',
        autoExport: true
      })
    })
  })

  describe('loadProjectConfig', () => {
    const rootPath = '/test/project'
    const configPath = '/test/project/translator.json'

    it('should load valid configuration from file', async () => {
      const configContent = {
        sourceDir: 'src/locales',
        targetDir: 'dist/locales',
        sourceLocale: 'en-US',
        targetLocales: ['fr-FR', 'es-ES'],
        defaultMarkdownEngine: 'deepl' as const
      }

      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(true)
      vi.mocked(mockFileSystem.readFile).mockResolvedValue(JSON.stringify(configContent))

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(mockFileSystem.fileExists).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: expect.stringContaining(TRANSLATOR_JSON)
      }))
      expect(mockFileSystem.readFile).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: expect.stringContaining(TRANSLATOR_JSON)
      }))
      expect(result.sourceDir).toBe('src/locales')
      expect(result.targetDir).toBe('dist/locales')
      expect(result.sourceLocale).toBe('en-US')
      expect(result.targetLocales).toEqual(['fr-FR', 'es-ES'])
      expect(result.defaultMarkdownEngine).toBe('deepl')
    })

    it('should use default configuration when file does not exist', async () => {
      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(false)

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(mockFileSystem.fileExists).toHaveBeenCalled()
      expect(mockFileSystem.readFile).not.toHaveBeenCalled()
      expect(result).toMatchObject(defaultConfig)
    })

    it('should handle invalid JSON in config file', async () => {
      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(true)
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('invalid json {')

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error loading translator.json')
      )
      expect(result).toMatchObject(defaultConfig)
    })

    it('should handle invalid configuration schema', async () => {
      const invalidConfig = {
        sourceLocale: 123, // invalid type
        defaultMarkdownEngine: 'invalidEngine' // invalid value
      }

      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(true)
      vi.mocked(mockFileSystem.readFile).mockResolvedValue(JSON.stringify(invalidConfig))

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid translator.json configuration')
      )
      // Should still return some config (with invalid parts used as-is since they're truthy)
      expect(result.sourceLocale).toBe(123) // uses the invalid value from parsed config since it's truthy
    })

    it('should merge project config with provider defaults', async () => {
      const projectConfig = {
        sourceDir: 'custom/src'
      }

      // Configure provider to return specific defaults
      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.sourceLocale') return 'custom-locale'
        if (section === 'translator.targetLocales') return ['custom-target']
        return defaultValue
      })

      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(true)
      vi.mocked(mockFileSystem.readFile).mockResolvedValue(JSON.stringify(projectConfig))

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(result.sourceDir).toBe('custom/src') // from project config
      expect(result.sourceLocale).toBe('custom-locale') // from provider
      expect(result.targetLocales).toEqual(['custom-target']) // from provider
    })

    it('should handle file system errors gracefully', async () => {
      vi.mocked(mockFileSystem.fileExists).mockRejectedValue(new Error('File system error'))

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error loading translator.json')
      )
      expect(result).toMatchObject(defaultConfig)
    })

    it('should convert legacy engine overrides format', async () => {
      // Configure provider to return legacy string format
      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.engineOverrides') {
          return {
            'deepl': 'fr,de,it',
            'google': 'es'
          }
        }
        return defaultValue
      })

      vi.mocked(mockFileSystem.fileExists).mockResolvedValue(false)

      const result = await loadProjectConfig(rootPath, mockConfigProvider, mockLogger, mockFileSystem)

      expect(result.engineOverrides).toEqual({
        'deepl': ['fr', 'de', 'it'],
        'google': ['es']
      })
    })
  })
})