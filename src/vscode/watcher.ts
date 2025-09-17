import * as vscode from 'vscode';
import { FileWatcher, WorkspaceWatcher, Disposable, FileRenameEvent, FileWatcherListeners } from '../core/util/watcher';
import { VSCodeUri, VSCodeFileSystem } from './filesystem';
import { IUri } from '../core/util/fs';

/**
 * VSCode file watcher implementation
 */
class VSCodeFileWatcher implements FileWatcher {
  private disposables: Disposable[] = [];
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

  watch(globPattern: string, listeners: FileWatcherListeners): Disposable {
    // Create VS Code file watcher - don't ignore any events since we always provide all listeners
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern);

    // Set up event listeners
    const subscriptions: vscode.Disposable[] = [];

    subscriptions.push(
      watcher.onDidCreate(vscodeUri => {
        listeners.onDidCreate(new VSCodeUri(vscodeUri));
      })
    );

    subscriptions.push(
      watcher.onDidChange(vscodeUri => {
        listeners.onDidChange(new VSCodeUri(vscodeUri));
      })
    );

    subscriptions.push(
      watcher.onDidDelete(vscodeUri => {
        listeners.onDidDelete(new VSCodeUri(vscodeUri));
      })
    );

    // Store watcher for cleanup
    const watcherId = `${globPattern}-${Date.now()}`;
    this.watchers.set(watcherId, watcher);

    // Return disposable for this specific watch
    return {
      dispose: () => {
        watcher.dispose();
        subscriptions.forEach(sub => sub.dispose());
        this.watchers.delete(watcherId);
      }
    };
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * VSCode workspace watcher implementation
 */
export class VSCodeWorkspaceWatcher implements WorkspaceWatcher {
  private disposables: Disposable[] = [];
  private fileSystem = new VSCodeFileSystem();

  createFileSystemWatcher(): FileWatcher {
    return new VSCodeFileWatcher();
  }

  onDidRenameFiles(listener: (e: FileRenameEvent) => void): Disposable {
    const subscription = vscode.workspace.onDidRenameFiles(renameEvent => {
      // Convert VS Code rename event to our format
      const event: FileRenameEvent = {
        files: renameEvent.files.map(file => ({
          oldUri: new VSCodeUri(file.oldUri),
          newUri: new VSCodeUri(file.newUri)
        }))
      };

      listener(event);
    });

    const disposable = {
      dispose: () => subscription.dispose()
    };

    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}