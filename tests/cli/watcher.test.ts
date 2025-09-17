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
    it('should create a file watcher', () => {
      const fileWatcher = watcher.createFileSystemWatcher();

      // Now test that watch method works
      fileWatcher.watch('**/*.json', {
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn()
      });

      // Now chokidar.watch should have been called
      const watchCall = vi.mocked(chokidar.watch).mock.calls.find(call => {
        const watchPath = call[0] as string;
        return watchPath.endsWith('**/*.json') || watchPath.endsWith('**\\*.json');
      });

      expect(watchCall).toBeDefined();
      expect(watchCall![1]).toEqual(expect.any(Object));

      expect(fileWatcher).toBeDefined();
      expect(typeof fileWatcher.watch).toBe('function');
      expect(typeof fileWatcher.dispose).toBe('function');
    });

    it('should notify listeners when events occur', () => {
      const fileWatcher = watcher.createFileSystemWatcher();

      const createListener = vi.fn();
      const changeListener = vi.fn();
      const deleteListener = vi.fn();

      fileWatcher.watch('**/*.json', {
        onDidCreate: createListener,
        onDidChange: changeListener,
        onDidDelete: deleteListener
      });

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
      const fileWatcher = watcher.createFileSystemWatcher();

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
      const fileWatcher = watcher.createFileSystemWatcher();

      // Start watching to create internal watchers
      fileWatcher.watch('**/*.json', {
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn()
      });

      // Dispose the workspace watcher
      watcher.dispose();

      // Verify the workspace watcher's watchers array is empty
      expect((watcher as any).watchers).toEqual([]);
      expect((watcher as any).disposables).toEqual([]);
    });
  });
});