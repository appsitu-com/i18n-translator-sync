import { IUri } from './fs'

/**
 * File change event interface
 */
export interface FileChangeEvent {
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
export interface FileRenameEvent {
  /**
   * The files that were renamed
   */
  files: { oldUri: IUri; newUri: IUri }[]
}

/**
 * File watcher event listeners
 */
export interface FileWatcherListeners {
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
export interface FileWatcher {
  /**
   * Watch files matching the given pattern and register event listeners
   * @param globPattern The glob pattern to watch
   * @param listeners The event listeners to register
   * @returns A disposable to stop watching
   */
  watch(globPattern: string, listeners: FileWatcherListeners): Disposable

  /**
   * Dispose the watcher and all active watches
   */
  dispose(): void
}

/**
 * Interface for workspace-level file system watchers
 */
export interface WorkspaceWatcher {
  /**
   * Create a file system watcher
   */
  createFileSystemWatcher(globPattern: string): FileWatcher

  /**
   * Register a listener for file rename events
   */
  onDidRenameFiles(listener: (e: FileRenameEvent) => void): Disposable

  /**
   * Dispose all watchers
   */
  dispose(): void
}

/**
 * Disposable resource interface
 */
export interface Disposable {
  /**
   * Dispose the resource
   */
  dispose(): void
}

/**
 * Create a disposable object from a dispose function
 */
export function toDisposable(dispose: () => void): Disposable {
  return { dispose }
}