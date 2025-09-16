import * as vscode from 'vscode';
import { FileWatcher, WorkspaceWatcher, Disposable, FileRenameEvent } from '../core/util/watcher';
import { VSCodeUri, VSCodeFileSystem } from './filesystem';
import { IUri } from '../core/util/fs';

/**
 * VSCode file watcher implementation
 */
class VSCodeFileWatcher implements FileWatcher {
  private disposables: Disposable[] = [];
  private watcher: vscode.FileSystemWatcher;

  constructor(
    globPattern: string,
    ignoreCreateEvents: boolean = false,
    ignoreChangeEvents: boolean = false,
    ignoreDeleteEvents: boolean = false
  ) {
    // Create VS Code file watcher
    this.watcher = vscode.workspace.createFileSystemWatcher(
      globPattern,
      ignoreCreateEvents,
      ignoreChangeEvents,
      ignoreDeleteEvents
    );

    // Add watcher to disposables
    this.disposables.push({
      dispose: () => this.watcher.dispose()
    });
  }

  onDidCreate(listener: (uri: IUri) => void): Disposable {
    const subscription = this.watcher.onDidCreate(vscodeUri => {
      listener(new VSCodeUri(vscodeUri));
    });

    const disposable = {
      dispose: () => subscription.dispose()
    };

    this.disposables.push(disposable);
    return disposable;
  }

  onDidChange(listener: (uri: IUri) => void): Disposable {
    const subscription = this.watcher.onDidChange(vscodeUri => {
      listener(new VSCodeUri(vscodeUri));
    });

    const disposable = {
      dispose: () => subscription.dispose()
    };

    this.disposables.push(disposable);
    return disposable;
  }

  onDidDelete(listener: (uri: IUri) => void): Disposable {
    const subscription = this.watcher.onDidDelete(vscodeUri => {
      listener(new VSCodeUri(vscodeUri));
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

/**
 * VSCode workspace watcher implementation
 */
export class VSCodeWorkspaceWatcher implements WorkspaceWatcher {
  private disposables: Disposable[] = [];
  private fileSystem = new VSCodeFileSystem();

  createFileSystemWatcher(
    globPattern: string,
    ignoreCreateEvents: boolean = false,
    ignoreChangeEvents: boolean = false,
    ignoreDeleteEvents: boolean = false
  ): FileWatcher {
    return new VSCodeFileWatcher(
      globPattern,
      ignoreCreateEvents,
      ignoreChangeEvents,
      ignoreDeleteEvents
    );
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