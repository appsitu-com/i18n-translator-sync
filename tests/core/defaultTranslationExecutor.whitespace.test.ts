import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DefaultTranslationExecutor } from '../../src/core/DefaultTranslationExecutor'
import { IFileSystem } from '../../src/core/util/fs'
import { ILogger } from '../../src/core/util/baseLogger'
import { ITranslationMemory } from '../../src/core/tm/ITranslationMemory'

const { bulkTranslateWithEngineMock } = vi.hoisted(() => ({
  bulkTranslateWithEngineMock: vi.fn()
}))

vi.mock('../../src/bulkTranslate', () => ({
  bulkTranslateWithEngine: bulkTranslateWithEngineMock
}))

describe('DefaultTranslationExecutor whitespace handling', () => {
  let executor: DefaultTranslationExecutor
  let mockFileSystem: IFileSystem
  let mockLogger: ILogger
  let mockCache: ITranslationMemory

  beforeEach(() => {
    bulkTranslateWithEngineMock.mockReset()

    mockFileSystem = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn(),
      readDirectory: vi.fn(),
      createDirectory: vi.fn(),
      createUri: vi.fn(),
      joinPath: vi.fn(),
      stat: vi.fn(),
      isDirectory: vi.fn().mockResolvedValue(false)
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
      exportTMX: vi.fn(),
      exportXLIFF: vi.fn(),
      importCSV: vi.fn(),
      close: vi.fn()
    }

    executor = new DefaultTranslationExecutor(mockFileSystem, mockLogger, mockCache, '/workspace')
  })

  it('trims edge whitespace before translation and restores it after translation', async () => {
    bulkTranslateWithEngineMock.mockResolvedValue({
      translations: ['BONJOUR', 'MONDE'],
      stats: { apiCalls: 1, cacheHits: 0, total: 2 }
    })

    const result = await executor.translateSegments(
      ['  hello  ', '\tworld\n'],
      [null, null],
      'google',
      'en',
      'fr',
      { apiKey: 'x' } as any,
      '/workspace/i18n/en/messages.json',
      false,
      [0, 1]
    )

    expect(bulkTranslateWithEngineMock).toHaveBeenCalledWith(
      ['hello', 'world'],
      [null, null],
      'google',
      expect.any(Object),
      mockCache,
      '/workspace/i18n/en/messages.json',
      [0, 1]
    )

    expect(result.translations).toEqual(['  BONJOUR  ', '\tMONDE\n'])
  })

  it('skips translation calls for whitespace-only segments and preserves them', async () => {
    bulkTranslateWithEngineMock.mockResolvedValue({
      translations: ['BONJOUR'],
      stats: { apiCalls: 1, cacheHits: 0, total: 1 }
    })

    const result = await executor.translateSegments(
      ['   ', ' hello '],
      [null, null],
      'google',
      'en',
      'fr',
      { apiKey: 'x' } as any,
      '/workspace/i18n/en/messages.json',
      false,
      [0, 1]
    )

    expect(bulkTranslateWithEngineMock).toHaveBeenCalledWith(
      ['hello'],
      [null],
      'google',
      expect.any(Object),
      mockCache,
      '/workspace/i18n/en/messages.json',
      [1]
    )

    expect(result.translations).toEqual(['   ', ' BONJOUR '])
  })
})
