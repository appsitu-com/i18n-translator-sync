import { IUri } from './fs'

/**
 * File change event interface
 */
export interface IFileChangeEvent {
  /**
   * The URI of the file that changed
   */
  uri: IUri

  /**
   * The type of change
   */
  type: 'created' | 'changed' | 'deleted'
}

/**
 * File rename event interface
 */
export interface IFileRenameEvent {
  /**
   * The files that were renamed
   */
  files: { oldUri: IUri; newUri: IUri }[]
}

/**
 * File watcher event listeners
 */
export interface IFileWatcherListeners {
  /**
   * Called when a file is created
   */
  onDidCreate: (uri: IUri) => void

  /**
   * Called when a file is changed
   */
  onDidChange: (uri: IUri) => void

  /**
   * Called when a file is deleted
   */
  onDidDelete: (uri: IUri) => void
}

/**
 * Interface for file watchers
 */
export interface IFileWatcher {
  /**
   * Watch files matching the given pattern and register event listeners
   * @param globPattern The glob pattern to watch
   * @param listeners The event listeners to register
   * @returns A disposable to stop watching
   */
  watch(globPattern: string, listeners: IFileWatcherListeners): IDisposable

  /**
   * Resolves when all active watches have completed their initial scan and
   * are ready to emit file-change events. Implementations backed by
   * always-ready watchers (e.g. VS Code API) should return a resolved promise.
   */
  waitUntilReady(): Promise<void>

  /**
   * Dispose the watcher and all active watches
   */
  dispose(): void
}

/**
 * Interface for workspace-level file system watchers
 */
export interface IWorkspaceWatcher {
  /**
   * Create a file system watcher
   */
  createFileSystemWatcher(): IFileWatcher

  /**
   * Register a listener for file rename events
   */
  onDidRenameFiles(listener: (e: IFileRenameEvent) => void): IDisposable

  /**
   * Dispose all watchers
   */
  dispose(): void
}

/**
 * IDisposable resource interface
 */
export interface IDisposable {
  /**
   * Dispose the resource
   */
  dispose(): void
}

/**
 * Create a disposable object from a dispose function
 */

export function toDisposable(dispose: () => void): IDisposable {
  return { dispose }
}