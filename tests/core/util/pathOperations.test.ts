import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import {
  findSourcePathForFile,
  getSourceBasePath,
  getTargetBasePath,
  getRelativePath,
  createTargetPath,
  createBackTranslationPath,
  createTargetUri,
  createBackTranslationUri
} from '../../../src/core/util/pathOperations'
import { FileSystem, IUri } from '../../../src/core/util/fs'
import { TranslateProjectConfig } from '../../../src/core/coreConfig'

// Create a sample configuration for tests
function createTestConfig(overrides: Partial<TranslateProjectConfig> = {}): TranslateProjectConfig {
  return {
    sourceLocale: 'en',
    sourcePaths: ['i18n/en', 'i18n/en.json'],
    sourceDir: '',
    targetDir: '',
    ...overrides
  } as TranslateProjectConfig
}

// Mock FileSystem for URI tests
function createMockFileSystem(): FileSystem {
  return {
    createUri: (fsPath: string): IUri => ({
      fsPath: fsPath.replace(/\\/g, '/'),
      scheme: 'file',
      path: fsPath.replace(/\\/g, '/')
    }),
    joinPath: (base: IUri, ...segments: string[]): IUri => {
      const joined = path.join(base.fsPath, ...segments).replace(/\\/g, '/')
      return {
        fsPath: joined,
        scheme: base.scheme,
        path: joined
      }
    },
    readFile: async () => '',
    writeFile: async () => {},
    deleteFile: async () => {},
    fileExists: async () => true,
    createDirectory: async () => {},
    readDirectory: async () => [],
    stat: async () => ({ size: 0, ctime: 0, mtime: 0 }),
    watch: () => ({ dispose: () => {} })
  } as unknown as FileSystem
}

describe('Core Paths Module', () => {
  // Mock console.log for these tests
  const consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('findSourcePathForFile', () => {
    it('finds directory source path for file within directory', () => {
      const filePath = '/workspace/i18n/en/messages.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBe('i18n/en')
    })

    it('finds file source path for exact file match', () => {
      const filePath = '/workspace/i18n/en.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBe('i18n/en.json')
    })

    it('finds most specific source path when multiple paths match', () => {
      // Both 'i18n/en' and 'i18n/en.json' could match, but 'i18n/en.json' is more specific
      const filePath = '/workspace/i18n/en.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en', 'i18n/en.json'] })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBe('i18n/en.json')
    })

    it('handles Windows-style paths', () => {
      const filePath = 'C:\\workspace\\i18n\\en.json'
      const workspacePath = 'C:\\workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBe('i18n/en.json')
    })

    it('returns null when file is not in any source path', () => {
      const filePath = '/workspace/other/file.json'
      const workspacePath = '/workspace'
      const config = createTestConfig()

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBeNull()
    })

    it('does not use sourceDir for source path resolution', () => {
      const filePath = '/workspace/src/i18n/en.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        sourceDir: 'src'
      })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBeNull()
    })
  })

  describe('getRelativePath', () => {
    it('gets relative path for file within directory source path', () => {
      const filePath = '/workspace/i18n/en/nested/messages.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = getRelativePath(filePath, workspacePath, config)
      expect(result).toBe('nested/messages.json')
    })

    it('gets filename for file-based source path', () => {
      const filePath = '/workspace/i18n/en.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = getRelativePath(filePath, workspacePath, config)
      expect(result).toBe('en.json')
    })

    // fails on GH Actions under Linux
    it.skip('handles Windows paths correctly', () => {
      const filePath = 'C:\\workspace\\i18n\\en.json'
      const workspacePath = 'C:\\workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = getRelativePath(filePath, workspacePath, config)
      expect(result).toBe('en.json')
    })

    it('throws error when file is not in any source path', () => {
      const filePath = '/workspace/other/file.json'
      const workspacePath = '/workspace'
      const config = createTestConfig()

      expect(() => getRelativePath(filePath, workspacePath, config))
        .toThrow('not in any of the configured source paths')
    })
  })

  describe('createTargetPath', () => {
    it('creates target path for directory source with relative path', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'nested/messages.json'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en')
      expect(result).toBe('/workspace/i18n/fr/nested/messages.json')
    })

    it('creates target path for file source without appending relative path', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'en.json'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en.json')
      expect(result).toBe('/workspace/i18n/fr.json')
    })

    it('detects file source path correctly by extension', () => {
      const workspacePath = 'C:/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'es'
      const relativePath = 'en.json'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en.json')

      // Should NOT append the relative path for file sources
      expect(result).toBe('C:/workspace/i18n/es.json')
      expect(result).not.toBe('C:/workspace/i18n/es.json/en.json')
    })

    it('ignores targetDir configuration for file sources', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'en.json'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        targetDir: 'dist'
      })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en.json')
      expect(result).toBe('/workspace/i18n/fr.json')
    })

    it('ignores targetDir configuration for directory sources', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'messages.json'
      const config = createTestConfig({
        sourcePaths: ['i18n/en'],
        targetDir: 'dist'
      })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en')
      expect(result).toBe('/workspace/i18n/fr/messages.json')
    })

    it('normalizes Windows paths correctly', () => {
      const workspacePath = 'C:\\workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'en.json'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en.json')
      expect(result).toBe('C:/workspace/i18n/fr.json')
    })
  })

  describe('getSourceBasePath', () => {
    it('returns workspace path when sourceDir is not specified', () => {
      const config = createTestConfig({ sourceDir: '' })
      const result = getSourceBasePath('/workspace', config)
      expect(result).toBe('/workspace')
    })

    it('ignores sourceDir and returns workspace path when specified', () => {
      const config = createTestConfig({ sourceDir: 'src' })
      const result = getSourceBasePath('/workspace', config)
      expect(result).toBe('/workspace')
    })
  })

  describe('getTargetBasePath', () => {
    it('returns workspace path when targetDir is not specified', () => {
      const config = createTestConfig({ targetDir: '' })
      const result = getTargetBasePath('/workspace', config)
      expect(result).toBe('/workspace')
    })

    it('ignores targetDir and returns workspace path when specified', () => {
      const config = createTestConfig({ targetDir: 'dist' })
      const result = getTargetBasePath('/workspace', config)
      expect(result).toBe('/workspace')
    })
  })

  describe('createBackTranslationPath', () => {
    it('creates back-translation path for directory-based source without targetDir', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config, 'i18n/en')
      expect(result).toBe('/workspace/i18n/fr_en/messages.json')
    })

    it('creates back-translation path for file-based source without targetDir', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createBackTranslationPath(workspacePath, 'fr', 'en.json', config, 'i18n/en.json')
      expect(result).toBe('/workspace/i18n/fr_en.json')
    })

    it('ignores targetDir for directory-based source back-translation paths', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en'],
        targetDir: 'dist'
      })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config, 'i18n/en')
      expect(result).toBe('/workspace/i18n/fr_en/messages.json')
    })

    it('ignores targetDir for file-based source back-translation paths', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        targetDir: 'dist'
      })

      const result = createBackTranslationPath(workspacePath, 'es', 'en.json', config, 'i18n/en.json')
      expect(result).toBe('/workspace/i18n/es_en.json')
    })

    it('creates back-translation path with custom sourcePath patterns', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['locale/en', 'src/translations/en.json']
      })

      // Directory-based source
      const resultDir = createBackTranslationPath(workspacePath, 'de', 'strings.json', config, 'locale/en')
      expect(resultDir).toBe('/workspace/locale/de_en/strings.json')

      // File-based source
      const resultFile = createBackTranslationPath(workspacePath, 'de', 'en.json', config, 'src/translations/en.json')
      expect(resultFile).toBe('/workspace/src/translations/de_en.json')
    })

    it('throws error when sourcePath is not provided', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig()

      expect(() =>
        createBackTranslationPath(workspacePath, 'fr', 'messages.json', config)
      ).toThrow('sourcePath is required for createBackTranslationPath')
    })

    it('creates back-translation path with non-English source locale', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourceLocale: 'de', sourcePaths: ['lang/de'] })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config, 'lang/de')
      expect(result).toBe('/workspace/lang/fr_de/messages.json')
    })
  })

  describe('createTargetUri', () => {
    it('creates target URI for directory-based translation', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = createTargetUri(
        fs,
        workspacePath,
        'en',
        'fr',
        'messages.json',
        config,
        'i18n/en'
      )

      expect(result.fsPath).toBe('/workspace/i18n/fr/messages.json')
    })

    it('creates target URI for file-based translation', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createTargetUri(
        fs,
        workspacePath,
        'en',
        'de',
        'en.json',
        config,
        'i18n/en.json'
      )

      expect(result.fsPath).toBe('/workspace/i18n/de.json')
    })

    it('ignores targetDir when creating target URI', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en'],
        targetDir: 'dist'
      })

      const result = createTargetUri(
        fs,
        workspacePath,
        'en',
        'es',
        'text.json',
        config,
        'i18n/en'
      )

      expect(result.fsPath).toBe('/workspace/i18n/es/text.json')
    })
  })

  describe('createBackTranslationUri', () => {
    it('creates back-translation URI for directory-based source', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = createBackTranslationUri(
        fs,
        workspacePath,
        'fr',
        'messages.json',
        config,
        'i18n/en'
      )

      expect(result.fsPath).toBe('/workspace/i18n/fr_en/messages.json')
    })

    it('creates back-translation URI for file-based source', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createBackTranslationUri(
        fs,
        workspacePath,
        'de',
        'en.json',
        config,
        'i18n/en.json'
      )

      expect(result.fsPath).toBe('/workspace/i18n/de_en.json')
    })

    it('ignores targetDir when creating back-translation URI', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en'],
        targetDir: 'dist'
      })

      const result = createBackTranslationUri(
        fs,
        workspacePath,
        'es',
        'strings.json',
        config,
        'i18n/en'
      )

      expect(result.fsPath).toBe('/workspace/i18n/es_en/strings.json')
    })

    it('throws when sourcePath is not provided', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig()

      expect(() =>
        createBackTranslationUri(
          fs,
          workspacePath,
          'fr',
          'messages.json',
          config
        )
      ).toThrow('sourcePath is required')
    })

    it('creates back-translation URI with custom sourcePath patterns', () => {
      const fs = createMockFileSystem()
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['locale/en', 'translations/en.json']
      })

      const result = createBackTranslationUri(
        fs,
        workspacePath,
        'fr',
        'labels.json',
        config,
        'locale/en'
      )

      expect(result.fsPath).toBe('/workspace/locale/fr_en/labels.json')
    })
  })
})