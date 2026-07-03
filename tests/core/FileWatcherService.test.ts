/**
 * Tests for FileWatcherService
 * Manages file system watchers for translation source files and configuration file changes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcherService } from '../../src/core/FileWatcherService';
import { IWorkspaceWatcher, IFileWatcher, IFileRenameEvent } from '../../src/core/util/watcher';
import { IUri } from '../../src/core/util/fs';
import { ILogger } from '../../src/core/util/baseLogger';
import { TRANSLATOR_JSON, TRANSLATOR_ENV } from '../../src/core/constants';
import { TranslateProjectConfig, defaultConfig } from '../../src/core/coreConfig';

// Mock dependencies
const createMockFileWatcher = () => ({
  watch: vi.fn(),
  waitUntilReady: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn()
});

const createMockWorkspaceWatcher = () => ({
  createFileSystemWatcher: vi.fn(),
  onDidRenameFiles: vi.fn(),
  dispose: vi.fn()
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn()
});

describe('FileWatcherService', () => {
  let fileWatcherService: FileWatcherService;
  let logger: ILogger;
  let workspaceWatcher: IWorkspaceWatcher;
  let mockFileWatcher: IFileWatcher;

  const defaultProjectConfig: TranslateProjectConfig = {
    ...defaultConfig,
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

  beforeEach(() => {
    logger = createMockLogger();
    workspaceWatcher = createMockWorkspaceWatcher();
    mockFileWatcher = createMockFileWatcher();

    vi.mocked(workspaceWatcher.createFileSystemWatcher).mockReturnValue(mockFileWatcher);

    fileWatcherService = new FileWatcherService(logger, workspaceWatcher);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('startWatching', () => {
    it('should create watchers for each source path', async () => {
      const onAddOrChange = vi.fn();
      const onDelete = vi.fn();
      const onRename = vi.fn();

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange,
        onDelete,
        onRename
      });

      // Should create watchers for source paths
      expect(workspaceWatcher.createFileSystemWatcher).toHaveBeenCalled();
      expect(mockFileWatcher.watch).toHaveBeenCalledWith(
        'i18n/en/**',
        expect.objectContaining({
          onDidCreate: expect.any(Function),
          onDidChange: expect.any(Function),
          onDidDelete: expect.any(Function)
        })
      );
    });

    it('should set up config file watchers when onConfigChanged handler is provided', async () => {
      const onConfigChanged = vi.fn();

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onConfigChanged
      });

      // Should create watchers for translator.json and translator.env
      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);
      const envWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_ENV);

      expect(jsonWatchCall).toBeDefined();
      expect(envWatchCall).toBeDefined();
    });

    it('should skip config file watchers when no onConfigChanged handler', async () => {
      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      // Should not create config file watchers
      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);
      const envWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_ENV);

      expect(jsonWatchCall).toBeUndefined();
      expect(envWatchCall).toBeUndefined();
    });

    it('should call onDidCreate handler when file is created', async () => {
      const onAddOrChange = vi.fn();

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange,
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      // Get the watch call for source paths
      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const sourceWatchCall = watchCalls.find((call: unknown[]) => (call[0] as string).includes('i18n/en'));

      expect(sourceWatchCall).toBeDefined();
      if (sourceWatchCall) {
        const listeners = sourceWatchCall[1] as any;
        const testUri: IUri = { fsPath: '/workspace/i18n/en/messages.json', path: '/workspace/i18n/en/messages.json', scheme: 'file' };

        await listeners.onDidCreate(testUri);

        expect(onAddOrChange).toHaveBeenCalledWith(testUri, defaultProjectConfig);
      }
    });

    it('should call onDelete handler when file is deleted', async () => {
      const onDelete = vi.fn();

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete,
        onRename: vi.fn()
      });

      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const sourceWatchCall = watchCalls.find((call: unknown[]) => (call[0] as string).includes('i18n/en'));

      if (sourceWatchCall) {
        const listeners = sourceWatchCall[1] as any;
        const testUri: IUri = { fsPath: '/workspace/i18n/en/messages.json', path: '/workspace/i18n/en/messages.json', scheme: 'file' };

        await listeners.onDidDelete(testUri);

        expect(onDelete).toHaveBeenCalledWith(testUri, defaultProjectConfig);
      }
    });

    it('should call onConfigChanged when translator.json changes', async () => {
      const onConfigChanged = vi.fn().mockResolvedValue(undefined);

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onConfigChanged
      });

      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);

      expect(jsonWatchCall).toBeDefined();
      if (jsonWatchCall) {
        const listeners = jsonWatchCall[1] as any;
        await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_JSON}`, scheme: 'file' });

        expect(onConfigChanged).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          `Configuration file changed (${TRANSLATOR_JSON}), reloading configuration...`
        );
      }
    });

    it('should call onConfigChanged when translator.env changes', async () => {
      const onConfigChanged = vi.fn().mockResolvedValue(undefined);

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onConfigChanged
      });

      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const envWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_ENV);

      expect(envWatchCall).toBeDefined();
      if (envWatchCall) {
        const listeners = envWatchCall[1] as any;
        await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_ENV}`, scheme: 'file' });

        expect(onConfigChanged).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          `Configuration file changed (${TRANSLATOR_ENV}), reloading configuration...`
        );
      }
    });

    it('should wait for watchers to be ready before returning', async () => {
      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      expect(mockFileWatcher.waitUntilReady).toHaveBeenCalled();
    });

    it('should set up rename handler', async () => {
      const onRename = vi.fn();

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename
      });

      expect(workspaceWatcher.onDidRenameFiles).toHaveBeenCalled();
    });
  });

  describe('stopWatching', () => {
    it('should dispose all watchers', async () => {
      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      await fileWatcherService.stopWatching();

      expect(mockFileWatcher.dispose).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Stopped watching for file changes');
    });

    it('should warn if not currently watching', async () => {
      await fileWatcherService.stopWatching();

      expect(logger.warn).toHaveBeenCalledWith('Not watching for file changes');
    });
  });

  describe('getIsWatching', () => {
    it('should return false when not watching', () => {
      expect(fileWatcherService.getIsWatching()).toBe(false);
    });

    it('should return true after starting watch', async () => {
      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      expect(fileWatcherService.getIsWatching()).toBe(true);
    });

    it('should return false after stopping watch', async () => {
      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn()
      });

      await fileWatcherService.stopWatching();

      expect(fileWatcherService.getIsWatching()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle errors in config change handler', async () => {
      const onConfigChanged = vi.fn().mockRejectedValue(new Error('Config reload failed'));

      await fileWatcherService.startWatching(defaultProjectConfig, {
        onAddOrChange: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onConfigChanged
      });

      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);

      if (jsonWatchCall) {
        const listeners = jsonWatchCall[1] as any;
        await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_JSON}`, scheme: 'file' });

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error handling configuration file change')
        );
      }
    });
  });
});
