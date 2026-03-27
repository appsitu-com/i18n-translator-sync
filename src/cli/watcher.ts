import * as chokidar from 'chokidar';
import * as path from 'path';
import { Logger } from '../core/util/baseLogger';
import { FileSystem } from '../core/util/fs';
import { FileWatcher, WorkspaceWatcher, Disposable, toDisposable, FileRenameEvent, FileWatcherListeners } from '../core/util/watcher';

/**
 * CLI implementation of file watcher using Chokidar
 */
class CliFileWatcher implements FileWatcher {
  private disposables: Disposable[] = [];
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private readyPromises: Promise<void>[] = [];

  constructor(
    private fs: FileSystem,
    private logger: Logger,
    private workspacePath: string
  ) {}

  watch(globPattern: string, listeners: FileWatcherListeners): Disposable {
    this.logger.debug(`Creating watcher for pattern: ${globPattern}`);

    // Convert glob pattern to chokidar pattern by joining with workspace path
    let watchPattern = path.join(this.workspacePath, globPattern);

    // Handle Windows-specific chokidar pattern issues
    // On Windows, chokidar has issues with glob patterns like /** so we need to adjust
    if (globPattern.endsWith('/**')) {
      // For directory recursive patterns, watch the directory directly
      // and chokidar will automatically watch subdirectories
      const dirPattern = globPattern.slice(0, -3); // Remove '/**'
      watchPattern = path.join(this.workspacePath, dirPattern);
      this.logger.debug(`Adjusted recursive directory pattern to: ${watchPattern}`);
    }

    // Create chokidar watcher
    const watcher = chokidar.watch(watchPattern, {
      ignored: /(^|[/\\])\.\./, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    // Set up event handlers
    watcher.on('add', (filePath: string) => {
      this.logger.debug(`File created: ${filePath}`);
      const uri = this.fs.createUri(filePath);
      listeners.onDidCreate(uri);
    });

    watcher.on('change', (filePath: string) => {
      this.logger.debug(`File changed: ${filePath}`);
      const uri = this.fs.createUri(filePath);
      listeners.onDidChange(uri);
    });

    watcher.on('unlink', (filePath: string) => {
      this.logger.debug(`File deleted: ${filePath}`);
      const uri = this.fs.createUri(filePath);
      listeners.onDidDelete(uri);
    });

    // Store watcher for cleanup
    const watcherId = `${globPattern}-${Date.now()}`;
    this.watchers.set(watcherId, watcher);

    // Track the ready promise so waitUntilReady() can await all scans
    this.readyPromises.push(new Promise<void>(resolve => watcher.on('ready', resolve)));

    // Return disposable for this specific watch
    return toDisposable(() => {
      watcher.close();
      this.watchers.delete(watcherId);
    });
  }

  waitUntilReady(): Promise<void> {
    return Promise.all(this.readyPromises).then(() => undefined);
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

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

  createFileSystemWatcher(): FileWatcher {
    const watcher = new CliFileWatcher(
      this.fs,
      this.logger,
      this.workspacePath
    );

    this.watchers.push(watcher);

    // Return the watcher instance - no automatic listeners setup
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