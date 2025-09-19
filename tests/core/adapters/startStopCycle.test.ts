import { describe, it, expect, beforeEach, vi } from 'vitest'

// IMPORTANT: Define all mocks BEFORE importing modules under test so Vitest hoists them correctly
vi.mock('../../../src/translators/translatorRegistry', () => ({
  registerAllTranslators: vi.fn()
}))

vi.mock('../../../src/core/util/environmentSetup', () => ({
  initTranslatorEnv: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../src/core/coreConfig', () => ({
  loadProjectConfig: vi.fn().mockResolvedValue({
    sourcePaths: ['i18n/en'],
    sourceLocale: 'en',
    targetLocales: ['fr', 'es'],
    enableBackTranslation: true,
    defaultMarkdownEngine: 'copy',
    defaultJsonEngine: 'copy',
    engineOverrides: {}
  })
}))

vi.mock('../../../src/core/translatorManager', () => ({
  TranslatorManager: vi.fn().mockImplementation(() => ({
    startWatching: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false)
  }))
}))

vi.mock('../../../src/core/cache/sqlite', () => ({
  SQLiteCache: vi.fn().mockImplementation(() => ({
    // minimal shape; tests don't call methods directly
    close: vi.fn()
  }))
}))

// Now import modules under test
import { TranslatorAdapter } from '../../../src/core/adapters/baseAdapter'
import { Logger } from '../../../src/core/util/baseLogger'
import { FileSystem } from '../../../src/core/util/fs'
import { ConfigProvider } from '../../../src/core/coreConfig'
import { WorkspaceWatcher } from '../../../src/core/util/watcher'

// (previous mock declarations moved above imports)

// Create a concrete test adapter
class TestTranslatorAdapter extends TranslatorAdapter {
  protected async handleFileOpen(path: string): Promise<void> {
    // Mock implementation
  }

  protected createWatcher(): WorkspaceWatcher {
    return {
      watch: vi.fn(),
      dispose: vi.fn()
    } as any
  }
}

describe('TranslatorAdapter Start-Stop Cycle', () => {
  let adapter: TestTranslatorAdapter
  let mockLogger: Logger
  let mockFileSystem: FileSystem
  let mockConfigProvider: ConfigProvider

  beforeEach(() => {
    // Create mocks
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as any

    mockFileSystem = {
      createUri: vi.fn().mockImplementation((path: string) => ({ fsPath: path })),
      fileExists: vi.fn().mockResolvedValue(true),
      createDirectory: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      writeFile: vi.fn()
    } as any

    mockConfigProvider = {
      get: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined)
    } as any

    adapter = new TestTranslatorAdapter('/test/workspace', mockLogger, mockFileSystem, mockConfigProvider)
  })

  it('should allow start-stop-start without error', async () => {
    // Initialize the adapter
    await adapter.initialize()

    // Start for the first time - should work
    await adapter.start()
    expect(adapter.isRunning()).toBe(true)

    // Stop - this disposes the translator manager
    adapter.stop()
    expect(adapter.isRunning()).toBe(false)

    // Start again - should auto-initialize and start without throwing
    await expect(adapter.start()).resolves.toBeUndefined()
    expect(adapter.isRunning()).toBe(true)
  })

  it('should allow restart-stop-restart without error', async () => {
    // Initialize the adapter
    await adapter.initialize()

    // Restart for the first time - should work
    await adapter.restart()
    expect(adapter.isRunning()).toBe(true)

    // Stop - this disposes the translator manager
    adapter.stop()
    expect(adapter.isRunning()).toBe(false)

    // Restart again - should succeed
    await expect(adapter.restart()).resolves.toBeUndefined()
    expect(adapter.isRunning()).toBe(true)
  })
})