import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import {
  findSourcePathForFile,
  getSourceBasePath,
  getTargetBasePath,
  getRelativePath,
  createTargetPath,
  createBackTranslationPath
} from '../../../src/core/util/paths'
import { TranslateProjectConfig } from '../../../src/core/config'

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

    it('handles sourceDir configuration', () => {
      const filePath = '/workspace/src/i18n/en.json'
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        sourceDir: 'src'
      })

      const result = findSourcePathForFile(filePath, workspacePath, config)
      expect(result).toBe('i18n/en.json')
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

    it('handles Windows paths correctly', () => {
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

    it('handles targetDir configuration for file sources', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'en.json'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        targetDir: 'dist'
      })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en.json')
      expect(result).toBe('/workspace/dist/i18n/fr.json')
    })

    it('handles targetDir configuration for directory sources', () => {
      const workspacePath = '/workspace'
      const sourceLocale = 'en'
      const targetLocale = 'fr'
      const relativePath = 'messages.json'
      const config = createTestConfig({
        sourcePaths: ['i18n/en'],
        targetDir: 'dist'
      })

      const result = createTargetPath(workspacePath, sourceLocale, targetLocale, relativePath, config, 'i18n/en')
      expect(result).toBe('/workspace/dist/i18n/fr/messages.json')
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

    it('joins workspace path with sourceDir when specified', () => {
      const config = createTestConfig({ sourceDir: 'src' })
      const result = getSourceBasePath('/workspace', config)
      expect(result).toBe('/workspace/src')
    })
  })

  describe('getTargetBasePath', () => {
    it('returns workspace path when targetDir is not specified', () => {
      const config = createTestConfig({ targetDir: '' })
      const result = getTargetBasePath('/workspace', config)
      expect(result).toBe('/workspace')
    })

    it('joins workspace path with targetDir when specified', () => {
      const config = createTestConfig({ targetDir: 'dist' })
      const result = getTargetBasePath('/workspace', config)
      expect(result).toBe('/workspace/dist')
    })
  })

  describe('createBackTranslationPath', () => {
    it('creates back-translation path with targetDir configured', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ targetDir: 'dist' })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config)
      expect(result).toBe('/workspace/dist/i18n/fr_en/messages.json')
    })

    it('creates back-translation path without targetDir (default behavior)', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ targetDir: '' })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config)
      expect(result).toBe('/workspace/i18n/fr_en/messages.json')
    })

    it('creates back-translation file path for file-based source', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en.json'] })

      const result = createBackTranslationPath(workspacePath, 'fr', 'en.json', config, 'i18n/en.json')
      expect(result).toBe('/workspace/i18n/fr_en.json')
    })

    it('creates back-translation directory path for directory-based source', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({ sourcePaths: ['i18n/en'] })

      const result = createBackTranslationPath(workspacePath, 'fr', 'messages.json', config, 'i18n/en')
      expect(result).toBe('/workspace/i18n/fr_en/messages.json')
    })

    it('creates back-translation file path with targetDir for file-based source', () => {
      const workspacePath = '/workspace'
      const config = createTestConfig({
        sourcePaths: ['i18n/en.json'],
        targetDir: 'dist'
      })

      const result = createBackTranslationPath(workspacePath, 'es', 'en.json', config, 'i18n/en.json')
      expect(result).toBe('/workspace/dist/i18n/es_en.json')
    })
  })
})