/**
 * FileWatcherService manages file system watchers for translation source files
 * and configuration file changes.
 */

import * as path from 'path'
import { IFileWatcher, IWorkspaceWatcher, IFileRenameEvent } from './util/watcher'
import { IUri } from './util/fs'
import { ILogger } from './util/baseLogger'
import { TRANSLATOR_JSON, TRANSLATOR_ENV } from './constants'
import { TranslateProjectConfig } from './coreConfig'

export type FileWatcherEventHandlers = {
  onAddOrChange: (uri: IUri, config: TranslateProjectConfig) => Promise<void>
  onDelete: (uri: IUri, config: TranslateProjectConfig) => Promise<void>
  onRename: (e: IFileRenameEvent, config: TranslateProjectConfig) => Promise<void>
  onConfigChanged?: () => Promise<void>
}

/**
 * Service for managing file system watchers
 */
export class FileWatcherService {
  private watchers: IFileWatcher[] = []
  private isWatching: boolean = false

  constructor(
    private readonly logger: ILogger,
    private readonly workspaceWatcher: IWorkspaceWatcher
  ) {}

  /**
   * Start watching for file changes in source paths
   * @param config The project configuration
   * @param handlers Event handlers for file changes
   */
  async startWatching(
    config: TranslateProjectConfig,
    handlers: FileWatcherEventHandlers
  ): Promise<void> {
    if (this.isWatching) {
      this.logger.warn('Already watching for file changes')
      return
    }

    this.logger.info('Starting to watch for file changes')

    // Create file watchers for each source path
    for (const sourcePath of config.sourcePaths) {
      // Normalize path for consistency across platforms
      const normalizedPath = sourcePath.replace(/\\/g, '/')

      this.logger.info(`Setting up watcher for: ${sourcePath}`)

      const pattern = normalizedPath.includes('.') ? normalizedPath : `${normalizedPath}/**`
      const watcher = this.workspaceWatcher.createFileSystemWatcher()

      // Set up event handlers using the new watch method
      watcher.watch(pattern, {
        onDidCreate: (uri: IUri) => handlers.onAddOrChange(uri, config),
        onDidChange: (uri: IUri) => handlers.onAddOrChange(uri, config),
        onDidDelete: (uri: IUri) => handlers.onDelete(uri, config)
      })

      // Add watcher to disposables
      this.watchers.push(watcher)

      this.logger.info(`Watcher created for ${pattern}`)
    }

    // Set up rename handler
    this.workspaceWatcher.onDidRenameFiles((e: IFileRenameEvent) => handlers.onRename(e, config))

    // Watch for configuration file changes
    this.setupConfigFileWatcher(handlers)

    // Wait for all chokidar watchers to complete their initial scan before returning.
    // This ensures callers can immediately write files and expect change events.
    await Promise.all(this.watchers.map(w => w.waitUntilReady?.() ?? Promise.resolve()))

    this.isWatching = true
    this.logger.info('Started watching for file changes')
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) {
      this.logger.warn('Not watching for file changes')
      return
    }

    // Dispose all watchers
    for (const watcher of this.watchers) {
      watcher.dispose()
    }

    this.watchers = []
    this.isWatching = false

    this.logger.info('Stopped watching for file changes')
  }

  /**
   * Set up watchers for configuration files (translator.json and translator.env)
   * When either config file changes, notify the handler to reload and restart
   * @private
   */
  private setupConfigFileWatcher(handlers: FileWatcherEventHandlers): void {
    if (!handlers.onConfigChanged) {
      return
    }

    // Watch for translator.json changes
    const jsonWatcher = this.workspaceWatcher.createFileSystemWatcher()
    jsonWatcher.watch(TRANSLATOR_JSON, {
      onDidCreate: () => this.handleConfigFileChange(handlers, TRANSLATOR_JSON),
      onDidChange: () => this.handleConfigFileChange(handlers, TRANSLATOR_JSON),
      onDidDelete: () => this.handleConfigFileChange(handlers, TRANSLATOR_JSON)
    })
    this.watchers.push(jsonWatcher)
    this.logger.info(`Watcher created for configuration file: ${TRANSLATOR_JSON}`)

    // Watch for translator.env changes
    const envWatcher = this.workspaceWatcher.createFileSystemWatcher()
    envWatcher.watch(TRANSLATOR_ENV, {
      onDidCreate: () => this.handleConfigFileChange(handlers, TRANSLATOR_ENV),
      onDidChange: () => this.handleConfigFileChange(handlers, TRANSLATOR_ENV),
      onDidDelete: () => this.handleConfigFileChange(handlers, TRANSLATOR_ENV)
    })
    this.watchers.push(envWatcher)
    this.logger.info(`Watcher created for environment file: ${TRANSLATOR_ENV}`)
  }

  /**
   * Handle changes to configuration files (translator.json or translator.env)
   * Triggers a callback to reload configuration and restart watching
   * @param handlers Event handlers
   * @param filename The name of the configuration file that changed
   * @private
   */
  private async handleConfigFileChange(handlers: FileWatcherEventHandlers, filename: string): Promise<void> {
    try {
      this.logger.info(`Configuration file changed (${filename}), reloading configuration...`)

      // Call the callback if provided
      if (handlers.onConfigChanged) {
        await handlers.onConfigChanged()
      } else {
        this.logger.warn('Configuration changed but no handler is registered. Please restart the translator.')
      }
    } catch (error) {
      this.logger.error(`Error handling configuration file change: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof Error && error.stack) {
        this.logger.debug(error.stack)
      }
    }
  }

  /**
   * Check if currently watching for file changes
   */
  getIsWatching(): boolean {
    return this.isWatching
  }
}
