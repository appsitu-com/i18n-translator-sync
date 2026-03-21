import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as vscode from 'vscode'
import * as pathsModule from '../../src/util/translationPaths'
import {
  normalizePath,
  containsLocale,
  replaceLocaleInPath,
  findSourcePathForFile,
  getSourceBasePath,
  getTargetBasePath,
  getRelativePath,
  createTargetUri,
  createBackTranslationUri,
  verifyFilePath
} from '../../src/util/translationPaths'

import { TranslateProjectConfig } from '../../src/core/coreConfig'

// Helper function to create mock URIs
function mockUri(filePath: string): vscode.Uri {
  return {
    fsPath: filePath,
    path: filePath.replace(/\\/g, '/'),
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    toString: () => filePath,
    with: () => mockUri(filePath),
    toJSON: () => ({ $mid: 1, path: filePath, scheme: 'file' })
  } as vscode.Uri
}

// Mock workspace folder
function mockWorkspaceFolder(folderPath: string): vscode.WorkspaceFolder {
  return {
    uri: mockUri(folderPath),
    name: path.basename(folderPath),
    index: 0
  }
}

// Create a sample configuration for tests
function createTestConfig(overrides: Partial<TranslateProjectConfig> = {}): TranslateProjectConfig {
  return {
    sourceLocale: 'en',
    sourcePaths: ['i18n/en', 'locales/en'],
    sourceDir: '',
    targetDir: '',
    ...overrides
  } as TranslateProjectConfig
}

describe('normalizePath', () => {
  it('normalizes Windows paths with backslashes', () => {
    expect(normalizePath('C:\\Users\\test\\path')).toBe('c:/users/test/path')
  })

  it('normalizes Unix paths (unchanged except for case)', () => {
    expect(normalizePath('/Users/test/Path')).toBe('/users/test/path')
  })

  it('normalizes mixed paths', () => {
    expect(normalizePath('/Users\\test/Path\\file.txt')).toBe('/users/test/path/file.txt')
  })

  it('normalizes paths with case differences', () => {
    expect(normalizePath('PATH/TO/FILE')).toBe('path/to/file')
  })

  it('handles empty path', () => {
    expect(normalizePath('')).toBe('')
  })
})

describe('containsLocale', () => {
  it('detects locale as folder name', () => {
    expect(containsLocale('path/en/file.json', 'en')).toBe(true)
  })

  it('detects locale as filename without extension', () => {
    expect(containsLocale('path/en.json', 'en')).toBe(true)
  })

  it('ignores locale as part of a larger folder name', () => {
    expect(containsLocale('path/engine/file.json', 'en')).toBe(false)
  })

  it('ignores locale as part of a larger filename', () => {
    expect(containsLocale('path/english.json', 'en')).toBe(false)
  })

  it('handles case differences', () => {
    expect(containsLocale('path/EN/file.json', 'en')).toBe(true)
    expect(containsLocale('path/En.json', 'eN')).toBe(true)
  })

  it('returns false when locale is not in path', () => {
    expect(containsLocale('path/fr/file.json', 'en')).toBe(false)
  })
})

describe('replaceLocaleInPath', () => {
  it('replaces locale in folder path', () => {
    expect(replaceLocaleInPath('path/en/file.json', 'en', 'fr')).toBe('path/fr/file.json')
  })

  it('replaces locale in filename', () => {
    expect(replaceLocaleInPath('path/en.json', 'en', 'fr')).toBe('path/fr.json')
  })

  it('handles case differences', () => {
    expect(replaceLocaleInPath('path/EN/file.json', 'en', 'fr')).toBe('path/fr/file.json')
  })

  it('returns original path when locale not found', () => {
    expect(replaceLocaleInPath('path/file.json', 'en', 'fr')).toBe('path/file.json')
  })

  it('works with special character locales', () => {
    expect(replaceLocaleInPath('path/en/file.json', 'en', 'zh-CN')).toBe('path/zh-CN/file.json')
  })
})

describe('findSourcePathForFile', () => {
  // Mock console.log for these tests
  const consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock workspace.getWorkspaceFolder
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockImplementation((uri) => {
      if (uri?.fsPath?.startsWith('C:/workspace')) {
        return mockWorkspaceFolder('C:/workspace')
      }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('finds source path for a file within configured source path', () => {
    const uri = mockUri('C:/workspace/i18n/en/test.json')
    const config = createTestConfig()

    const result = findSourcePathForFile(uri, config)
    expect(result).toBe('i18n/en')
  })

  it('finds source path when sourceDir is configured', () => {
    const uri = mockUri('C:/workspace/src/i18n/en/test.json')
    const config = createTestConfig({ sourceDir: 'src' })

    // Mock to return workspace folder for this URI
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValueOnce(mockWorkspaceFolder('C:/workspace'))

    const result = findSourcePathForFile(uri, config)
    expect(result).toBe('i18n/en')
  })

  it('returns null when file is not in any source path', () => {
    const uri = mockUri('C:/workspace/other/test.json')
    const config = createTestConfig()

    const result = findSourcePathForFile(uri, config)
    expect(result).toBeNull()
  })

  it('returns null when workspace is null', () => {
    const uri = mockUri('C:/other/i18n/en/test.json')
    const config = createTestConfig()

    // Mock to return null workspace folder
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValueOnce(undefined)

    const result = findSourcePathForFile(uri, config)
    expect(result).toBeNull()
  })

  it('returns null when URI has no path', () => {
    // Create a simplified URI with no path property
    const uri = {
      scheme: 'file',
      fsPath: undefined,
      path: undefined,
      toString: () => 'file://no-path'
    } as unknown as vscode.Uri

    const config = createTestConfig()

    // Instead of checking log output, which is implementation detail, just verify the return value
    const result = findSourcePathForFile(uri, config)
    expect(result).toBeNull()
  })
})

describe('getSourceBasePath', () => {
  it('returns workspace path when sourceDir is not specified', () => {
    const config = createTestConfig({ sourceDir: '' })
    const result = getSourceBasePath('C:/workspace', config)
    expect(result).toBe('C:/workspace')
  })

  it('joins workspace path with sourceDir when specified', () => {
    const config = createTestConfig({ sourceDir: 'src' })
    const result = getSourceBasePath('C:/workspace', config)
    expect(result).toBe(path.join('C:/workspace', 'src'))
  })
})

describe('getTargetBasePath', () => {
  it('returns workspace path when targetDir is not specified', () => {
    const config = createTestConfig({ targetDir: '' })
    const result = getTargetBasePath('C:/workspace', config)
    expect(result).toBe('C:/workspace')
  })

  it('joins workspace path with targetDir when specified', () => {
    const config = createTestConfig({ targetDir: 'dist' })
    const result = getTargetBasePath('C:/workspace', config)
    expect(result).toBe(path.join('C:/workspace', 'dist'))
  })
})

describe('getRelativePath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gets relative path for a file in source path', () => {
    // Create a URI that's in a known source path from our default test config
    const uri = mockUri('C:/workspace/i18n/en/nested/test.json')
    const config = createTestConfig()
    const ws = mockWorkspaceFolder('C:/workspace')

    // Just mock workspace.getWorkspaceFolder since it's an external dependency
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(ws)

    // Use the real findSourcePathForFile function
    const result = getRelativePath(uri, config)
    expect(result).toBe(path.join('nested', 'test.json'))
  })

  it('throws error when file is not in any source path', () => {
    // Create a URI that's not in any source path from our test config
    const uri = mockUri('C:/workspace/other/test.json')
    const config = createTestConfig()
    const ws = mockWorkspaceFolder('C:/workspace')

    // Just mock workspace.getWorkspaceFolder since it's an external dependency
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(ws)

    // The real findSourcePathForFile will return null for this path
    expect(() => getRelativePath(uri, config)).toThrow('not in any of the configured source paths')
  })

  it('throws error when workspace is null', () => {
    // Use a path that's outside the mocked workspace
    const uri = mockUri('C:/other/i18n/en/test.json')
    const config = createTestConfig()

    // Mock to return null workspace folder - this is necessary as we're simulating
    // a file outside the workspace
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(undefined)

    expect(() => getRelativePath(uri, config)).toThrow('No workspace found')
  })
})

describe('createTargetUri', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock vscode.Uri.file and joinPath
    vi.spyOn(vscode.Uri, 'file').mockImplementation((fsPath) => mockUri(fsPath))
    vi.spyOn(vscode.Uri, 'joinPath').mockImplementation((base, ...pathSegments) => {
      const basePath = base.fsPath || base.path
      const joinedPath = path.join(basePath, ...pathSegments)
      return mockUri(joinedPath)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates target URI with matching source path pattern', () => {
    const ws = mockWorkspaceFolder('C:/workspace')
    const config = createTestConfig()

    const result = createTargetUri(ws, 'en', 'fr', 'test.json', config, 'i18n/en')
    expect(result.fsPath).toContain(path.join('C:/workspace', 'i18n/fr', 'test.json'))
  })

  it('creates target URI with sourceDir and targetDir configured', () => {
    const ws = mockWorkspaceFolder('C:/workspace')
    const config = createTestConfig({
      sourceDir: 'src',
      targetDir: 'dist'
    })

    const result = createTargetUri(ws, 'en', 'fr', 'test.json', config, 'i18n/en')
    expect(result.fsPath).toContain(path.join('C:/workspace', 'dist/i18n/fr', 'test.json'))
  })

  it('throws error when target locale is the same as source locale', () => {
    const ws = mockWorkspaceFolder('C:/workspace')
    const config = createTestConfig()

    expect(() => createTargetUri(ws, 'en', 'EN', 'test.json', config, 'i18n/en')).toThrow(
      'Target locale "EN" is the same as source locale "en". This would overwrite source files.'
    )
  })

  it('uses default structure if source paths do not contain locale identifier', () => {
    const ws = mockWorkspaceFolder('C:/workspace')

    // Create a config with source paths that don't contain the locale marker
    const config = createTestConfig({
      sourcePaths: ['content/resources'], // This path doesn't contain 'en' as a folder or filename
      sourceLocale: 'en'
    })

    // It should fall back to the default i18n/{locale} structure
    const result = createTargetUri(ws, 'en', 'fr', 'test.json', config, 'content/resources')
    expect(result.fsPath).toContain(path.join('C:/workspace', 'i18n/fr', 'test.json'))
  })

  it('throws error when workspace is null', () => {
    const config = createTestConfig()

    expect(() =>
      createTargetUri(undefined as unknown as vscode.WorkspaceFolder, 'en', 'fr', 'test.json', config, 'i18n/en')
    ).toThrow('Invalid or missing workspace folder')
  })

  it('uses default i18n/{locale} structure when no source path contains locale', () => {
    const ws = mockWorkspaceFolder('C:/workspace')

    // Create a config with source paths that don't contain the locale
    // in a way that the real containsLocale() will return false
    const config = createTestConfig({
      sourcePaths: ['content/english', 'translations/strings'], // Neither path contains 'en' as a folder or filename
      sourceLocale: 'en'
    })

    const result = createTargetUri(ws, 'en', 'fr', 'test.json', config, 'content/english')
    expect(result.fsPath).toContain(path.join('C:/workspace', 'i18n/fr', 'test.json'))
  })
})

describe('createBackTranslationUri', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock vscode.Uri.file and joinPath
    vi.spyOn(vscode.Uri, 'file').mockImplementation((fsPath) => mockUri(fsPath))
    vi.spyOn(vscode.Uri, 'joinPath').mockImplementation((base, ...pathSegments) => {
      const basePath = base.fsPath || base.path
      const joinedPath = path.join(basePath, ...pathSegments)
      return mockUri(joinedPath)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates back-translation URI with targetDir configured', () => {
    const ws = mockWorkspaceFolder('C:/workspace')
    const config = createTestConfig({ targetDir: 'dist' })

    const result = createBackTranslationUri(ws, 'fr', 'test.json', config)
    expect(result.fsPath).toContain(path.join('C:/workspace', 'dist/i18n/fr_en', 'test.json'))
  })

  it('creates back-translation URI without targetDir (default behavior)', () => {
    const ws = mockWorkspaceFolder('C:/workspace')
    const config = createTestConfig({ targetDir: '' })

    const result = createBackTranslationUri(ws, 'fr', 'test.json', config)
    expect(result.fsPath).toContain(path.join('C:/workspace', 'i18n/fr_en', 'test.json'))
  })

  it('throws error when workspace is null', () => {
    const config = createTestConfig()

    expect(() =>
      createBackTranslationUri(undefined as unknown as vscode.WorkspaceFolder, 'fr', 'test.json', config)
    ).toThrow('Invalid or missing workspace folder')
  })
})

describe('verifyFilePath', () => {
  // Move the mock inside beforeEach to ensure it's reset between tests
  let consoleLogMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks()
    // Create a fresh console.log mock for each test
    consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock workspace.getWorkspaceFolder
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockImplementation((uri) => {
      if (uri.fsPath && uri.fsPath.startsWith('C:/workspace')) {
        return mockWorkspaceFolder('C:/workspace')
      }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs verification info for a file in source path', () => {
    const uri = mockUri('C:/workspace/i18n/en/test.json')
    const config = createTestConfig()

    verifyFilePath(uri, config)

    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('Verification for file'))
    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('Is file in path? true'))
  })

  it('logs info for a file not in source path', () => {
    const uri = mockUri('C:/workspace/other/test.json')
    const config = createTestConfig()

    verifyFilePath(uri, config)

    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('Verification for file'))
    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('Is file in path? false'))
  })

  it('logs message when workspace is null', () => {
    const uri = mockUri('C:/other/test.json')
    const config = createTestConfig()

    // Mock to return null workspace folder
    vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValueOnce(undefined)

    verifyFilePath(uri, config)

    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('No workspace found'))
  })

  it('logs message when URI has no path', () => {
    // Create a simplified URI with no path property
    const uri = {
      scheme: 'file',
      fsPath: undefined,
      path: undefined,
      toString: () => 'file://no-path'
    } as unknown as vscode.Uri

    const config = createTestConfig()

    // Just ensure this doesn't throw an error
    verifyFilePath(uri, config)

    // Our implementation shows the log message about no workspace found first
    expect(consoleLogMock).toHaveBeenCalled()
  })
})
