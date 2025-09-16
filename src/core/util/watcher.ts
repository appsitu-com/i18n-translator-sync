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
 * Interface for file watchers
 */
export interface FileWatcher {
  /**
   * Register a listener for file creation events
   */
  onDidCreate(listener: (uri: IUri) => void): Disposable

  /**
   * Register a listener for file change events
   */
  onDidChange(listener: (uri: IUri) => void): Disposable

  /**
   * Register a listener for file deletion events
   */
  onDidDelete(listener: (uri: IUri) => void): Disposable

  /**
   * Dispose the watcher
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
  createFileSystemWatcher(
    globPattern: string,
    ignoreCreateEvents?: boolean,
    ignoreChangeEvents?: boolean,
    ignoreDeleteEvents?: boolean
  ): FileWatcher

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