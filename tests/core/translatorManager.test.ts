import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslatorManager } from '../../src/core/translatorManager';
import { TranslateProjectConfig } from '../../src/core/config';
import { FileSystem, IUri } from '../../src/core/util/fs';
import { Logger } from '../../src/core/util/logger';
import { FileWatcher, WorkspaceWatcher } from '../../src/core/util/watcher';

// Mock dependencies
const createMockFileSystem = () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  fileExists: vi.fn(),
  createDirectory: vi.fn(),
  readDirectory: vi.fn(),
  createUri: vi.fn((path) => ({ fsPath: path, path, scheme: 'file' })),
  joinPath: vi.fn((uri, ...segments) => {
    const joined = [uri.fsPath, ...segments].join('/');
    return { fsPath: joined, path: joined, scheme: 'file' };
  })
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn()
});

const createMockFileWatcher = () => ({
  onDidCreate: vi.fn(),
  onDidChange: vi.fn(),
  onDidDelete: vi.fn(),
  dispose: vi.fn()
});

const createMockWorkspaceWatcher = () => ({
  createFileSystemWatcher: vi.fn(),
  onDidRenameFiles: vi.fn(),
  dispose: vi.fn()
});

const createMockCache = () => ({
  putMany: vi.fn(),
  getMany: vi.fn(),
  close: vi.fn(),
  deleteForFile: vi.fn(),
  getAllForLocale: vi.fn(),
  exportCSV: vi.fn(),
  importCSV: vi.fn(),
  getStats: vi.fn()
});

const createMockConfigProvider = () => ({
  get: vi.fn(),
  update: vi.fn()
});

// Mock project config
const defaultProjectConfig: TranslateProjectConfig = {
  sourceDir: '',
  targetDir: '',
  sourcePaths: ['i18n/en'],
  sourceLocale: 'en',
  targetLocales: ['fr', 'es'],
  enableBackTranslation: false,
  defaultMarkdownEngine: 'azure',
  defaultJsonEngine: 'google',
  engineOverrides: {}
};

// Mock for MateCat module
vi.mock('../../src/matecate', () => ({
  pushCacheToMateCat: vi.fn(),
  pullReviewedFromMateCat: vi.fn()
}));

describe('TranslatorManager', () => {
  let fileSystem: FileSystem;
  let logger: Logger;
  let cache: any;
  let workspaceWatcher: WorkspaceWatcher;
  let configProvider: any;
  let translatorManager: TranslatorManager;
  let mockFileWatcher: any;

  beforeEach(() => {
    fileSystem = createMockFileSystem();
    logger = createMockLogger();
    cache = createMockCache();
    workspaceWatcher = createMockWorkspaceWatcher();
    configProvider = createMockConfigProvider();
    mockFileWatcher = createMockFileWatcher();

    // Setup mock workspace watcher
    vi.mocked(workspaceWatcher.createFileSystemWatcher).mockReturnValue(mockFileWatcher);

    // Setup mock import
    vi.mock('../../src/matecate', async () => {
      return {
        pushCacheToMateCat: vi.fn(),
        pullReviewedFromMateCat: vi.fn()
      };
    });

    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      '/workspace',
      workspaceWatcher,
      configProvider
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('startWatching', () => {
    it('should create watchers for each source path', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      // Should create a watcher for each source path
      expect(workspaceWatcher.createFileSystemWatcher).toHaveBeenCalledWith(
        '**/i18n/en/**',
        false,
        false,
        false
      );

      // Should set up event handlers
      expect(mockFileWatcher.onDidCreate).toHaveBeenCalled();
      expect(mockFileWatcher.onDidChange).toHaveBeenCalled();
      expect(mockFileWatcher.onDidDelete).toHaveBeenCalled();

      // Should set up rename handler
      expect(workspaceWatcher.onDidRenameFiles).toHaveBeenCalled();

      // Should log the start
      expect(logger.info).toHaveBeenCalledWith('Started watching for file changes');
    });

    it('should not start watching if already watching', async () => {
      // Start watching once
      await translatorManager.startWatching(defaultProjectConfig);

      // Reset mocks to check if they're called again
      vi.resetAllMocks();

      // Try to start watching again
      await translatorManager.startWatching(defaultProjectConfig);

      // Should warn and not create more watchers
      expect(logger.warn).toHaveBeenCalledWith('Already watching for file changes');
      expect(workspaceWatcher.createFileSystemWatcher).not.toHaveBeenCalled();
    });
  });

  describe('stopWatching', () => {
    it('should dispose all watchers', async () => {
      // First start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Then stop watching
      await translatorManager.stopWatching();

      // Should dispose the watcher
      expect(mockFileWatcher.dispose).toHaveBeenCalled();

      // Should log the stop
      expect(logger.info).toHaveBeenCalledWith('Stopped watching for file changes');
    });

    it('should warn if not watching', async () => {
      await translatorManager.stopWatching();

      expect(logger.warn).toHaveBeenCalledWith('Not watching for file changes');
    });
  });

  describe('MateCat integration', () => {
    let matecatModule: any;

    beforeEach(async () => {
      matecatModule = await import('../../src/matecate');
      vi.spyOn(matecatModule, 'pushCacheToMateCat').mockResolvedValue(undefined);
      vi.spyOn(matecatModule, 'pullReviewedFromMateCat').mockResolvedValue(undefined);
    });

    it('should push translations to MateCat', async () => {
      await translatorManager.pushToMateCat();

      expect(matecatModule.pushCacheToMateCat).toHaveBeenCalledWith(cache);
      expect(logger.info).toHaveBeenCalledWith('Successfully pushed translations to MateCat');
    });

    it('should pull translations from MateCat', async () => {
      await translatorManager.pullFromMateCat();

      expect(matecatModule.pullReviewedFromMateCat).toHaveBeenCalledWith(cache);
      expect(logger.info).toHaveBeenCalledWith('Successfully pulled translations from MateCat');
    });
  });

  describe('File event handlers', () => {
    let mockPipeline: any;

    beforeEach(() => {
      // Mock pipeline methods
      mockPipeline = {
        processFile: vi.fn().mockResolvedValue(undefined),
        removeFile: vi.fn().mockResolvedValue(undefined)
      };

      // Replace real pipeline with mock
      (translatorManager as any).pipeline = mockPipeline;
    });

    it('should handle file creation events', async () => {
      // Start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the file creation handler
      const createHandler = vi.mocked(mockFileWatcher.onDidCreate).mock.calls[0][0];

      // Create a test URI
      const testUri = { fsPath: '/workspace/i18n/en/test.json', scheme: 'file', path: '/workspace/i18n/en/test.json' };

      // Trigger the handler
      await createHandler(testUri);

      // Should call the pipeline
      expect(mockPipeline.processFile).toHaveBeenCalledWith(
        testUri,
        '/workspace',
        defaultProjectConfig,
        expect.any(Object)
      );

      // Should log the action
      expect(logger.info).toHaveBeenCalledWith(`File changed: ${testUri.fsPath}`);
      expect(logger.info).toHaveBeenCalledWith(`Successfully processed file: ${testUri.fsPath}`);
    });

    it('should handle file deletion events', async () => {
      // Start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the file deletion handler
      const deleteHandler = vi.mocked(mockFileWatcher.onDidDelete).mock.calls[0][0];

      // Create a test URI
      const testUri = { fsPath: '/workspace/i18n/en/deleted.json', scheme: 'file', path: '/workspace/i18n/en/deleted.json' };

      // Trigger the handler
      await deleteHandler(testUri);

      // Should call the pipeline
      expect(mockPipeline.removeFile).toHaveBeenCalledWith(
        testUri,
        '/workspace',
        defaultProjectConfig
      );

      // Should log the action
      expect(logger.info).toHaveBeenCalledWith(`File deleted: ${testUri.fsPath}`);
      expect(logger.info).toHaveBeenCalledWith(`Successfully removed translations for file: ${testUri.fsPath}`);
    });
  });

  describe('dispose', () => {
    it('should dispose watchers and close cache', async () => {
      // Start watching to create watchers
      await translatorManager.startWatching(defaultProjectConfig);

      // Dispose the manager
      translatorManager.dispose();

      // Should dispose watchers
      expect(mockFileWatcher.dispose).toHaveBeenCalled();

      // Should close the cache
      expect(cache.close).toHaveBeenCalled();
    });
  });
});