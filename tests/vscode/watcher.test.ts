import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { VSCodeWorkspaceWatcher } from '../../src/vscode/watcher';
import { VSCodeUri } from '../../src/vscode/filesystem';

// Mock VSCode APIs
vi.mock('vscode', () => {
  return {
    workspace: {
      createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn()
      })),
      onDidRenameFiles: vi.fn()
    },
    Uri: {
      file: (path: string) => ({
        fsPath: path,
        scheme: 'file',
        path: path.replace(/\\/g, '/'),
        toString: () => `file://${path.replace(/\\/g, '/')}`
      })
    }
  };
});

describe('VSCodeWorkspaceWatcher', () => {
  let watcher: VSCodeWorkspaceWatcher;

  beforeEach(() => {
    vi.resetAllMocks();
    watcher = new VSCodeWorkspaceWatcher();
  });

  describe('createFileSystemWatcher', () => {
    it('should create a VSCode file watcher', () => {
      const fileWatcher = watcher.createFileSystemWatcher();

      expect(fileWatcher).toBeDefined();
      expect(typeof fileWatcher.watch).toBe('function');
      expect(typeof fileWatcher.dispose).toBe('function');
    });
  });

  describe('onDidRenameFiles', () => {
    it('should register rename event listener and convert events', () => {
      // Mock the onDidRenameFiles implementation
      const mockSubscription = { dispose: vi.fn() };
      vi.mocked(vscode.workspace.onDidRenameFiles).mockReturnValue(mockSubscription as any);

      // Register a listener
      const listener = vi.fn();
      const disposable = watcher.onDidRenameFiles(listener);

      // Get the callback that was registered
      const callback = vi.mocked(vscode.workspace.onDidRenameFiles).mock.calls[0][0];

      // Create a mock VSCode rename event
      const mockVSCodeEvent = {
        files: [
          {
            oldUri: { fsPath: '/old/path.txt', path: '/old/path.txt' },
            newUri: { fsPath: '/new/path.txt', path: '/new/path.txt' }
          }
        ]
      };

      // Simulate VSCode firing the event
      callback(mockVSCodeEvent as any);

      // Verify our listener got called with converted event
      expect(listener).toHaveBeenCalledWith({
        files: [
          {
            oldUri: expect.any(VSCodeUri),
            newUri: expect.any(VSCodeUri)
          }
        ]
      });

      // Verify the event data was converted correctly
      const calledEvent = listener.mock.calls[0][0];
      expect(calledEvent.files[0].oldUri.fsPath).toBe('/old/path.txt');
      expect(calledEvent.files[0].newUri.fsPath).toBe('/new/path.txt');

      // Test dispose
      disposable.dispose();
      expect(mockSubscription.dispose).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose all watchers', () => {
      // Create some disposables
      const disposable1 = { dispose: vi.fn() };
      const disposable2 = { dispose: vi.fn() };

      // Access the private disposables field using type assertion
      (watcher as any).disposables = [disposable1, disposable2];

      // Dispose the watcher
      watcher.dispose();

      // Verify all disposables were disposed
      expect(disposable1.dispose).toHaveBeenCalled();
      expect(disposable2.dispose).toHaveBeenCalled();
      expect((watcher as any).disposables).toEqual([]);
    });
  });
});