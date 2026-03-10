import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadProjectConfig, defaultConfig, toProjectConfig, TranslateConfigSchema, type ConfigProvider, type TranslateProjectConfig } from '../../src/core/coreConfig'
import { Logger } from '../../src/core/util/baseLogger'
import type { ITranslatorConfig } from '../../src/core/config'

// Mock loadTranslatorConfig from the config module
const { mockLoadTranslatorConfig } = vi.hoisted(() => ({
  mockLoadTranslatorConfig: vi.fn()
}))

vi.mock('../../src/core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config')>()
  return {
    ...actual,
    loadTranslatorConfig: mockLoadTranslatorConfig
  }
})

describe('Config', () => {
  let mockLogger: Logger
  let mockConfigProvider: ConfigProvider

  /** Helper to build a partial ITranslatorConfig (merged with defaults) */
  function makeConfig(overrides: Partial<ITranslatorConfig> = {}): ITranslatorConfig {
    return {
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
      autoExport: true,
      autoImport: false,
      translator: undefined,
      ...overrides
    } as ITranslatorConfig
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLoadTranslatorConfig.mockReturnValue({
      config: makeConfig(),
      errors: []
    })

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }

    mockConfigProvider = {
      get: vi.fn().mockImplementation((_section: string, defaultValue: any) => defaultValue),
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
          autoExport: true,
          autoImport: false
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
        autoExport: true,
        autoImport: false
      })
    })
  })

  describe('loadProjectConfig', () => {
    const rootPath = '/test/project'

    it('should delegate to loadTranslatorConfig and return project config', () => {
      mockLoadTranslatorConfig.mockReturnValue({
        config: makeConfig({
          sourceDir: 'src/locales',
          targetDir: 'dist/locales',
          sourceLocale: 'en-US',
          targetLocales: ['fr-FR', 'es-ES'],
          defaultMarkdownEngine: 'deepl'
        }),
        errors: []
      })

      const result = loadProjectConfig(rootPath, mockConfigProvider, mockLogger)

      expect(mockLoadTranslatorConfig).toHaveBeenCalledWith(rootPath, mockLogger, undefined)
      expect(result.sourceDir).toBe('src/locales')
      expect(result.targetDir).toBe('dist/locales')
      expect(result.sourceLocale).toBe('en-US')
      expect(result.targetLocales).toEqual(['fr-FR', 'es-ES'])
      expect(result.defaultMarkdownEngine).toBe('deepl')
      // Should not include translator credentials
      expect((result as any).translator).toBeUndefined()
    })

    it('should return defaults when loadTranslatorConfig returns empty config', () => {
      // Default mock already returns makeConfig() which has default values
      const result = loadProjectConfig(rootPath, mockConfigProvider, mockLogger)

      expect(result).toMatchObject(defaultConfig)
    })

    it('should use preloaded config and skip loadTranslatorConfig', () => {
      const preloaded = makeConfig({
        sourceDir: 'preloaded/src',
        sourceLocale: 'de'
      })

      const result = loadProjectConfig(rootPath, mockConfigProvider, mockLogger, undefined, preloaded)

      expect(mockLoadTranslatorConfig).not.toHaveBeenCalled()
      expect(result.sourceDir).toBe('preloaded/src')
      expect(result.sourceLocale).toBe('de')
    })

    it('should merge project config with provider defaults', () => {
      mockLoadTranslatorConfig.mockReturnValue({
        config: makeConfig({ sourceDir: 'custom/src', sourceLocale: '', targetLocales: [] }),
        errors: []
      })

      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.sourceLocale') return 'custom-locale'
        if (section === 'translator.targetLocales') return ['custom-target']
        return defaultValue
      })

      const result = loadProjectConfig(rootPath, mockConfigProvider, mockLogger)

      expect(result.sourceDir).toBe('custom/src')
      expect(result.sourceLocale).toBe('custom-locale')
      expect(result.targetLocales).toEqual(['custom-target'])
    })

    it('should convert legacy engine overrides format from provider', () => {
      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.engineOverrides') {
          return {
            'deepl': 'fr,de,it',
            'google': 'es'
          }
        }
        return defaultValue
      })

      const result = loadProjectConfig(rootPath, mockConfigProvider, mockLogger)

      expect(result.engineOverrides).toEqual({
        'deepl': ['fr', 'de', 'it'],
        'google': ['es']
      })
    })
  })

  describe('toProjectConfig', () => {
    it('should prefer config values over provider defaults', () => {
      const config = makeConfig({
        sourceLocale: 'fr',
        targetLocales: ['de', 'es']
      })

      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.sourceLocale') return 'en'
        if (section === 'translator.targetLocales') return ['ja']
        return defaultValue
      })

      const result = toProjectConfig(config, mockConfigProvider)

      expect(result.sourceLocale).toBe('fr')
      expect(result.targetLocales).toEqual(['de', 'es'])
    })

    it('should fall back to configProvider when config fields are empty', () => {
      const config = makeConfig({
        sourceLocale: '',
        targetLocales: []
      })

      vi.mocked(mockConfigProvider.get).mockImplementation((section: string, defaultValue: any) => {
        if (section === 'translator.sourceLocale') return 'ja'
        if (section === 'translator.targetLocales') return ['ko', 'zh']
        return defaultValue
      })

      const result = toProjectConfig(config, mockConfigProvider)

      expect(result.sourceLocale).toBe('ja')
      expect(result.targetLocales).toEqual(['ko', 'zh'])
    })

    it('should strip the translator block from the result', () => {
      const config = makeConfig({
        translator: { azure: { key: 'secret', region: 'eastus' } } as any
      })

      const result = toProjectConfig(config, mockConfigProvider)

      expect((result as any).translator).toBeUndefined()
    })
  })
})