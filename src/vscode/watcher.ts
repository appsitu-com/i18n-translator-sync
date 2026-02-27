import * as vscode from 'vscode';
import { FileWatcher, WorkspaceWatcher, Disposable, FileRenameEvent, FileWatcherListeners } from '../core/util/watcher';
import { VSCodeUri, VSCodeFileSystem } from './filesystem';

/**
 * VSCode file watcher implementation
 */
class VSCodeFileWatcher implements FileWatcher {
  private disposables: Disposable[] = [];
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private workspaceFolder: vscode.WorkspaceFolder;

  constructor(workspaceFolder: vscode.WorkspaceFolder) {
    this.workspaceFolder = workspaceFolder;
  }

  watch(globPattern: string, listeners: FileWatcherListeners): Disposable {
    // Create a RelativePattern to ensure VS Code watches relative to the correct workspace folder
    // This is especially important on Windows and for multi-root workspaces
    const relativePattern = new vscode.RelativePattern(this.workspaceFolder, globPattern);

    // Create VS Code file watcher - don't ignore any events since we always provide all listeners
    const watcher = vscode.workspace.createFileSystemWatcher(relativePattern);

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
  private workspaceFolder: vscode.WorkspaceFolder;

  constructor(workspaceFolder?: vscode.WorkspaceFolder) {
    // Use provided workspace folder or default to first workspace folder
    this.workspaceFolder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0]!;

    if (!this.workspaceFolder) {
      throw new Error('No workspace folder available for file watching');
    }
  }

  createFileSystemWatcher(): FileWatcher {
    return new VSCodeFileWatcher(this.workspaceFolder);
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