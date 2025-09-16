import * as chokidar from 'chokidar';
import * as path from 'path';
import * as minimatch from 'minimatch';
import { Logger } from '../core/util/logger';
import { FileSystem, IUri } from '../core/util/fs';
import { FileWatcher, WorkspaceWatcher, Disposable, toDisposable, FileRenameEvent } from '../core/util/watcher';

/**
 * CLI implementation of file watcher using Chokidar
 */
class CliFileWatcher implements FileWatcher {
  private disposables: Disposable[] = [];
  private watcher: chokidar.FSWatcher;
  private createListeners: Array<(uri: IUri) => void> = [];
  private changeListeners: Array<(uri: IUri) => void> = [];
  private deleteListeners: Array<(uri: IUri) => void> = [];

  constructor(
    private fs: FileSystem,
    private logger: Logger,
    globPattern: string,
    private ignoreCreateEvents: boolean = false,
    private ignoreChangeEvents: boolean = false,
    private ignoreDeleteEvents: boolean = false,
    private workspacePath: string
  ) {
    this.logger.debug(`Creating watcher for pattern: ${globPattern}`);

    // Convert VSCode glob pattern to chokidar pattern
    const watchPattern = path.join(workspacePath, globPattern);

    // Create chokidar watcher
    this.watcher = chokidar.watch(watchPattern, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    // Set up event handlers
    if (!ignoreCreateEvents) {
      this.watcher.on('add', (filePath: string) => {
        this.onFileCreated(filePath);
      });
    }

    if (!ignoreChangeEvents) {
      this.watcher.on('change', (filePath: string) => {
        this.onFileChanged(filePath);
      });
    }

    if (!ignoreDeleteEvents) {
      this.watcher.on('unlink', (filePath: string) => {
        this.onFileDeleted(filePath);
      });
    }

    // Add watcher to disposables
    this.disposables.push(toDisposable(() => {
      this.watcher.close();
    }));
  }

  private onFileCreated(filePath: string): void {
    this.logger.debug(`File created: ${filePath}`);
    const uri = this.fs.createUri(filePath);
    for (const listener of this.createListeners) {
      listener(uri);
    }
  }

  private onFileChanged(filePath: string): void {
    this.logger.debug(`File changed: ${filePath}`);
    const uri = this.fs.createUri(filePath);
    for (const listener of this.changeListeners) {
      listener(uri);
    }
  }

  private onFileDeleted(filePath: string): void {
    this.logger.debug(`File deleted: ${filePath}`);
    const uri = this.fs.createUri(filePath);
    for (const listener of this.deleteListeners) {
      listener(uri);
    }
  }

  onDidCreate(listener: (uri: IUri) => void): Disposable {
    this.createListeners.push(listener);

    const disposable = toDisposable(() => {
      this.createListeners = this.createListeners.filter(l => l !== listener);
    });

    this.disposables.push(disposable);
    return disposable;
  }

  onDidChange(listener: (uri: IUri) => void): Disposable {
    this.changeListeners.push(listener);

    const disposable = toDisposable(() => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    });

    this.disposables.push(disposable);
    return disposable;
  }

  onDidDelete(listener: (uri: IUri) => void): Disposable {
    this.deleteListeners.push(listener);

    const disposable = toDisposable(() => {
      this.deleteListeners = this.deleteListeners.filter(l => l !== listener);
    });

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
 * CLI implementation of workspace watcher
 */
export class CliWorkspaceWatcher implements WorkspaceWatcher {
  private disposables: Disposable[] = [];
  private renameListeners: Array<(e: FileRenameEvent) => void> = [];
  private watchers: CliFileWatcher[] = [];
  private deletedFiles = new Map<string, { path: string, timestamp: number }>();
  private checkIntervalId: NodeJS.Timeout | null = null;

  constructor(
    private fs: FileSystem,
    private logger: Logger,
    private workspacePath: string
  ) {
    // Start monitoring for renames (deletions followed by creations)
    this.checkIntervalId = setInterval(() => this.checkRenames(), 500);

    // Add interval to disposables
    this.disposables.push(toDisposable(() => {
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
    }));
  }

  /**
   * Check for potential file renames by matching deletions and creations
   */
  private checkRenames(): void {
    const now = Date.now();

    // Remove entries older than 2 seconds
    for (const [key, entry] of this.deletedFiles.entries()) {
      if (now - entry.timestamp > 2000) {
        this.deletedFiles.delete(key);
      }
    }
  }

  /**
   * Process potential rename events
   */
  processRename(oldPath: string, newPath: string): void {
    this.logger.debug(`Detected rename: ${oldPath} -> ${newPath}`);

    const event: FileRenameEvent = {
      files: [{
        oldUri: this.fs.createUri(oldPath),
        newUri: this.fs.createUri(newPath)
      }]
    };

    for (const listener of this.renameListeners) {
      listener(event);
    }
  }

  createFileSystemWatcher(
    globPattern: string,
    ignoreCreateEvents: boolean = false,
    ignoreChangeEvents: boolean = false,
    ignoreDeleteEvents: boolean = false
  ): FileWatcher {
    const watcher = new CliFileWatcher(
      this.fs,
      this.logger,
      globPattern,
      ignoreCreateEvents,
      ignoreChangeEvents,
      ignoreDeleteEvents,
      this.workspacePath
    );

    this.watchers.push(watcher);

    // Track deletions for potential rename detection
    if (!ignoreDeleteEvents) {
      watcher.onDidDelete((uri) => {
        this.deletedFiles.set(path.basename(uri.fsPath), {
          path: uri.fsPath,
          timestamp: Date.now()
        });
      });
    }

    // Track creations for potential rename detection
    if (!ignoreCreateEvents) {
      watcher.onDidCreate((uri) => {
        const basename = path.basename(uri.fsPath);
        const deleted = this.deletedFiles.get(basename);

        if (deleted && uri.fsPath !== deleted.path) {
          // Potential rename detected
          this.processRename(deleted.path, uri.fsPath);
          this.deletedFiles.delete(basename);
        }
      });
    }

    return watcher;
  }

  onDidRenameFiles(listener: (e: FileRenameEvent) => void): Disposable {
    this.renameListeners.push(listener);

    const disposable = toDisposable(() => {
      this.renameListeners = this.renameListeners.filter(l => l !== listener);
    });

    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.watchers = [];
    this.disposables = [];
  }
}