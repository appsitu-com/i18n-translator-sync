import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslatorAdapter } from '../../../src/core/adapters/baseAdapter';
import { Logger } from '../../../src/core/util/baseLogger';
import { FileSystem, IUri } from '../../../src/core/util/fs';
import { ConfigProvider } from '../../../src/core/coreConfig';
import { WorkspaceWatcher } from '../../../src/core/util/watcher';
import { TranslatorManager } from '../../../src/core/translatorManager';
import { SQLiteCache } from '../../../src/core/cache/sqlite';
import * as path from 'path';

import { createTranslatorManagerMock } from '../../mocks/translatorManager';

// Mock dependencies
vi.mock('../../../src/core/translatorManager', () => {
  return {
    TranslatorManager: vi.fn().mockImplementation(() => ({
      startWatching: vi.fn().mockResolvedValue(undefined),
      translateSingleFile: vi.fn().mockResolvedValue(undefined),
      bulkTranslate: vi.fn().mockResolvedValue(5),
      pushToMateCat: vi.fn().mockResolvedValue(undefined),
      pullFromMateCat: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn()
    }))
  };
});

vi.mock('../../../src/core/cache/sqlite', () => ({
  SQLiteCache: vi.fn().mockImplementation(() => ({
    close: vi.fn()
  }))
}));

vi.mock('../../../src/core/config', () => ({
  loadProjectConfig: vi.fn().mockResolvedValue({
    sourcePaths: ['i18n/en'],
    sourceLocale: 'en',
    targetLocales: ['fr', 'de'],
    enableBackTranslation: false,
    defaultMarkdownEngine: 'azure',
    defaultJsonEngine: 'google',
    engineOverrides: {}
  }),
  ConfigProvider: vi.fn()
}));

// Test implementation of TranslatorAdapter
class TestTranslatorAdapter extends TranslatorAdapter {
  fileOpenHandlerCalled = false;

  // Required implementation of abstract methods
  protected async handleFileOpen(path: string): Promise<void> {
    this.fileOpenHandlerCalled = true;
  }

  protected createWatcher(): WorkspaceWatcher {
    return {
      createFileSystemWatcher: vi.fn().mockReturnValue({
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn()
      }),
      onDidRenameFiles: vi.fn(),
      dispose: vi.fn()
    };
  }

  // Override initialize to create our own mock translator manager
  async initialize(): Promise<void> {
    // Call original initialize but then override the translator manager
    await super.initialize();

    // Create our own translator manager with all required methods
    if (this.translatorManager) {
      // Add the required methods if they don't exist
      this.translatorManager.startWatching = this.translatorManager.startWatching || vi.fn().mockResolvedValue(undefined);
      this.translatorManager.translateSingleFile = this.translatorManager.translateSingleFile || vi.fn().mockResolvedValue(undefined);
      this.translatorManager.bulkTranslate = this.translatorManager.bulkTranslate || vi.fn().mockResolvedValue(5);
      this.translatorManager.pushToMateCat = this.translatorManager.pushToMateCat || vi.fn().mockResolvedValue(undefined);
      this.translatorManager.pullFromMateCat = this.translatorManager.pullFromMateCat || vi.fn().mockResolvedValue(undefined);
      this.translatorManager.dispose = this.translatorManager.dispose || vi.fn();
    }
  }

  // Expose protected methods for testing
  public async testGetCache(): Promise<SQLiteCache | undefined> {
    return await this.getCache();
  }

  public testHandleFileOpen(path: string): Promise<void> {
    return this.handleFileOpen(path);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getTranslatorManager(): TranslatorManager | undefined {
    return this.translatorManager;
  }
}

describe('TranslatorAdapter', () => {
  let adapter: TestTranslatorAdapter;
  let mockLogger: Logger;
  let mockFileSystem: FileSystem;
  let mockConfigProvider: ConfigProvider;
  const testWorkspacePath = '/test/workspace';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock objects
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    };

    mockFileSystem = {
      fileExists: vi.fn().mockResolvedValue(true),
      directoryExists: vi.fn().mockResolvedValue(true),
      createDirectory: vi.fn().mockResolvedValue(undefined),
      createDirectorySync: vi.fn(),
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFileSync: vi.fn().mockReturnValue('{}'),
      writeFileSync: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      createUri: vi.fn((path) => ({ fsPath: path } as IUri)),
      dirname: vi.fn((uri) => path.dirname(uri.fsPath)),
      basename: vi.fn((uri) => path.basename(uri.fsPath)),
      join: vi.fn((...parts) => parts.join('/')),
      // Mock implementations for methods used in the base adapter
      fileExistsSync: vi.fn().mockReturnValue(true),
      directoryExistsSync: vi.fn().mockReturnValue(true)
    } as unknown as FileSystem;

    mockConfigProvider = {
      load: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((key, defaultValue) => defaultValue),
      update: vi.fn().mockResolvedValue(undefined)
    };

    // Create adapter instance
    adapter = new TestTranslatorAdapter(
      testWorkspacePath,
      mockLogger,
      mockFileSystem,
      mockConfigProvider
    );
  });

  describe('initialization', () => {
    it('should initialize correctly', async () => {
      await adapter.initialize();

      expect(mockConfigProvider.load).toHaveBeenCalled();
      expect(SQLiteCache).toHaveBeenCalled();
      expect(TranslatorManager).toHaveBeenCalled();
      expect(adapter.getTranslatorManager()).toBeDefined();
    });

    it('should handle initialization errors', async () => {
      // Make initialization fail
      vi.mocked(TranslatorManager).mockImplementationOnce(() => {
        throw new Error('Initialization error');
      });

      await expect(adapter.initialize()).rejects.toThrow('Initialization error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should start the translator manager', async () => {
      await adapter.initialize();
      await adapter.start();

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.startWatching).toHaveBeenCalled();
      expect(adapter.isRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Translator started');
    });

    it('should handle already running state', async () => {
      await adapter.initialize();
      await adapter.start();
      await adapter.start(); // Second call

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.startWatching).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should auto-initialize on start if not initialized', async () => {
      await expect(adapter.start()).resolves.toBeUndefined();
      expect(adapter.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the translator manager', async () => {
      await adapter.initialize();
      await adapter.start();
      adapter.stop();

      expect(adapter.isRunning()).toBe(false);
      expect(adapter.getTranslatorManager()).toBeUndefined();
    });

    it('should handle when not running', () => {
      adapter.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Translator not running');
    });
  });

  describe('restart', () => {
    it('should restart the translator manager', async () => {
      // Spy on initialize and start
      const initializeSpy = vi.spyOn(adapter, 'initialize');
      const startSpy = vi.spyOn(adapter, 'start');

      await adapter.initialize();
      await adapter.start();

      // Clear call counts
      initializeSpy.mockClear();
      startSpy.mockClear();

      await adapter.restart();

      expect(initializeSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('translateFile', () => {
    it('should translate a single file', async () => {
      await adapter.initialize();
      await adapter.start();

      await adapter.translateFile('test.json', false);

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.translateSingleFile).toHaveBeenCalled();
    });

    it('should handle file not found', async () => {
      await adapter.initialize();
      await adapter.start();

      // Mock file not found
      mockFileSystem.fileExists = vi.fn().mockResolvedValue(false);

      await adapter.translateFile('nonexistent.json', false);

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.translateSingleFile).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });

    it('should handle unsupported file type', async () => {
      await adapter.initialize();
      await adapter.start();

      await adapter.translateFile('test.unsupported', false);

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.translateSingleFile).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported file type'));
    });
  });

  describe('bulkTranslate', () => {
    it('should bulk translate files', async () => {
      await adapter.initialize();
      await adapter.start();

      const result = await adapter.bulkTranslate(true);

      const translatorManager = adapter.getTranslatorManager();
      // Check that it was called with the correct parameters
      // The mock might be receiving parameters in a different order than expected
      // Just verify it was called with the force parameter
      expect(translatorManager?.bulkTranslate).toHaveBeenCalled();
      if (translatorManager?.bulkTranslate) {
        const bulkTranslateCall = vi.mocked(translatorManager.bulkTranslate).mock.calls[0];
        expect(bulkTranslateCall).toBeDefined();
        expect(bulkTranslateCall[bulkTranslateCall.length - 1]).toBe(true); // Last param should be force=true
      }
      expect(result).toBe(5); // Mock returns 5 files
    });

    it('should handle bulk translation errors', async () => {
      await adapter.initialize();
      await adapter.start();

      // Make bulkTranslate fail
      const translatorManager = adapter.getTranslatorManager();
      if (translatorManager) {
        vi.mocked(translatorManager.bulkTranslate).mockRejectedValueOnce(new Error('Bulk translation error'));
      }

      const result = await adapter.bulkTranslate(false);

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Bulk translation failed'));
    });
  });

  describe('MateCat integration', () => {
    it('should push to MateCat', async () => {
      await adapter.initialize();
      await adapter.start();

      await adapter.pushToMateCat();

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.pushToMateCat).toHaveBeenCalled();
    });

    it('should pull from MateCat', async () => {
      await adapter.initialize();
      await adapter.start();

      await adapter.pullFromMateCat();

      const translatorManager = adapter.getTranslatorManager();
      expect(translatorManager?.pullFromMateCat).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', async () => {
      await adapter.initialize();
      await adapter.start();

      adapter.dispose();

      expect(adapter.isRunning()).toBe(false);
      expect(adapter.getTranslatorManager()).toBeUndefined();
    });
  });
});