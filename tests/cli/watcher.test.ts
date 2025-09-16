import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import * as path from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { CliWorkspaceWatcher } from '../../src/cli/watcher';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/logger';
import * as chokidar from 'chokidar';

// Mock chokidar
vi.mock('chokidar', () => {
  return {
    watch: vi.fn(() => ({
      on: vi.fn((event, callback) => {
        // Store callbacks for later triggering
        if (!mockedWatcher.callbacks[event]) {
          mockedWatcher.callbacks[event] = [];
        }
        mockedWatcher.callbacks[event].push(callback);
        return mockedWatcher.instance;
      }),
      close: vi.fn()
    }))
  };
});

// Mocked watcher state for tests
const mockedWatcher = {
  instance: null as any,
  callbacks: {} as Record<string, Array<(path: string) => void>>,
  reset() {
    this.callbacks = {};
  },
  trigger(event: string, path: string) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => callback(path));
    }
  }
};

function makeTmpDir(prefix = 'i18n-watcher-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe('CliWorkspaceWatcher', () => {
  let testDir: string;
  let fileSystem: NodeFileSystem;
  let logger: ConsoleLogger;
  let watcher: CliWorkspaceWatcher;

  beforeEach(() => {
    testDir = makeTmpDir();
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');

    // Spy on logger methods
    vi.spyOn(logger, 'debug').mockImplementation(() => {});

    watcher = new CliWorkspaceWatcher(fileSystem, logger, testDir);

    // Setup mocked watcher
    mockedWatcher.reset();
    mockedWatcher.instance = chokidar.watch('pattern');
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
    watcher.dispose();
  });

  describe('createFileSystemWatcher', () => {
    it('should create a file watcher with the specified pattern', () => {
      const fileWatcher = watcher.createFileSystemWatcher('**/*.json');

      // Second call will have the full path with the pattern
      // Check if it ends with our pattern (may have a full path prefix)
      const watchPath = vi.mocked(chokidar.watch).mock.calls[1][0] as string;
      expect(watchPath.endsWith('**/*.json') || watchPath.endsWith('**\\*.json')).toBe(true);
      expect(vi.mocked(chokidar.watch).mock.calls[1][1]).toEqual(expect.any(Object));

      expect(fileWatcher).toBeDefined();
      expect(typeof fileWatcher.onDidCreate).toBe('function');
      expect(typeof fileWatcher.onDidChange).toBe('function');
      expect(typeof fileWatcher.onDidDelete).toBe('function');
    });

    it('should respect ignore flags', () => {
      const fileWatcher = watcher.createFileSystemWatcher(
        '**/*.json',
        true,  // ignoreCreateEvents
        false, // ignoreChangeEvents
        false  // ignoreDeleteEvents
      );

      // Create event should not be set up
      expect(mockedWatcher.callbacks['add']).toBeUndefined();
      // Change event should be set up
      expect(mockedWatcher.callbacks['change']).toBeDefined();
      // Delete event should be set up
      expect(mockedWatcher.callbacks['unlink']).toBeDefined();
    });

    it('should notify listeners when events occur', () => {
      const fileWatcher = watcher.createFileSystemWatcher('**/*.json');

      const createListener = vi.fn();
      const changeListener = vi.fn();
      const deleteListener = vi.fn();

      fileWatcher.onDidCreate(createListener);
      fileWatcher.onDidChange(changeListener);
      fileWatcher.onDidDelete(deleteListener);

      // Simulate events
      const filePath = path.join(testDir, 'test.json');
      mockedWatcher.trigger('add', filePath);
      mockedWatcher.trigger('change', filePath);
      mockedWatcher.trigger('unlink', filePath);

      // Verify listeners were called with URI objects
      expect(createListener).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: filePath
      }));
      expect(changeListener).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: filePath
      }));
      expect(deleteListener).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: filePath
      }));
    });
  });

  describe('onDidRenameFiles', () => {
    it('should detect rename events', () => {
      const renameListener = vi.fn();
      watcher.onDidRenameFiles(renameListener);

      // Mock a file watcher to track deletions for rename detection
      const fileWatcher = watcher.createFileSystemWatcher('**/*');

      // We need to access the private method for testing
      const processRename = (watcher as any).processRename.bind(watcher);

      // Simulate a rename event
      const oldPath = path.join(testDir, 'old.json');
      const newPath = path.join(testDir, 'new.json');
      processRename(oldPath, newPath);

      // Verify the rename event was fired
      expect(renameListener).toHaveBeenCalledWith({
        files: [
          {
            oldUri: expect.objectContaining({ fsPath: oldPath }),
            newUri: expect.objectContaining({ fsPath: newPath })
          }
        ]
      });
    });
  });

  describe('dispose', () => {
    it('should dispose all watchers and listeners', () => {
      // Create a file watcher
      const fileWatcher = watcher.createFileSystemWatcher('**/*.json');

      // Setup spy on chokidar close method
      const closeSpy = vi.fn();
      (fileWatcher as any).watcher.close = closeSpy;

      // Add to watchers list
      (watcher as any).watchers = [fileWatcher];

      // Dispose the watcher
      watcher.dispose();

      // Verify all chokidar watchers were closed
      expect(closeSpy).toHaveBeenCalled();
      expect((watcher as any).watchers).toEqual([]);
      expect((watcher as any).disposables).toEqual([]);
    });
  });
});