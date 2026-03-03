import * as path from 'path';
import { TranslatorManager } from '../translatorManager';
import { loadProjectConfig } from '../coreConfig';
import { Logger } from '../util/baseLogger';
import { FileSystem } from '../util/fs';
import { WorkspaceWatcher } from '../util/watcher';
import { SQLiteCache } from '../cache/sqlite';
import { ConfigProvider } from '../coreConfig';
import { initTranslatorEnv } from '../util/environmentSetup';
import { registerAllTranslators } from '../../translators/translatorRegistry';
import { IPassphraseManager } from '../secrets/passphraseManager';

/**
 * Base adapter for the TranslatorManager that can be extended for different environments
 */
export abstract class TranslatorAdapter {
  protected translatorManager?: TranslatorManager;
  protected cache?: SQLiteCache;
  protected running = false;

  /**
   * Create a translator adapter
   */
  constructor(
    protected readonly workspacePath: string,
    protected readonly logger: Logger,
    protected readonly fileSystem: FileSystem,
    protected readonly configProvider: ConfigProvider
  ) {}

  /**
   * Abstract method to handle a file being opened
   */
  protected abstract openDocument(path: string): Promise<void>;

  /**
   * Abstract method to create a workspace watcher appropriate for the environment
   */
  protected abstract createWatcher(): WorkspaceWatcher;

  /**
   * Optional passphrase manager hook for environments that support encrypted keys
   */
  protected getPassphraseManager(): IPassphraseManager | undefined {
    return undefined;
  }

  /**
   * Get or create the cache
   */
  protected async getCache(dbMustExist = false): Promise<SQLiteCache | undefined> {
    const dbPath = path.join(this.workspacePath, '.i18n-cache', 'translation.db');

    // Check if the database file exists (for dbMustExist mode)
    if (dbMustExist) {
      const dbUri = this.fileSystem.createUri(dbPath);
      const exists = await this.fileSystem.fileExists(dbUri);
      if (!exists) {
        this.logger.error(`${dbPath}: Translation cache not found. Start the translator to create it.`);
        return undefined;
      }
    }

    // Ensure the cache directory exists
    const cacheDir = path.dirname(dbPath);
    const dirUri = this.fileSystem.createUri(cacheDir);
    await this.fileSystem.createDirectory(dirUri);

    this.cache = new SQLiteCache(dbPath, this.logger);
    return this.cache;
  }

  /**
   * Create a handler for configuration file changes
   * Returns a callback that will reload config and restart watching
   * @protected
   */
  protected createConfigChangeHandler(): () => Promise<void> {
    return async () => {
      if (!this.translatorManager || !this.running) {
        return;
      }

      try {
        this.logger.info('Configuration file changed, reloading configuration and environment...');

        // Reload the configuration provider (translator.json)
        if (this.configProvider.load) {
          await this.configProvider.load();
        }

        // Reload environment variables (translator.env)
        await initTranslatorEnv(
          this.workspacePath,
          this.logger,
          this.fileSystem
        );

        // Stop current watching
        await this.translatorManager.stopWatching();

        // Load new project configuration
        const projectConfig = await loadProjectConfig(
          this.workspacePath,
          this.configProvider,
          this.logger,
          this.fileSystem
        );

        // Start watching with new configuration
        await this.translatorManager.startWatching(projectConfig);

        this.logger.info('Configuration and environment reloaded, translator restarted successfully');
      } catch (error: any) {
        this.logger.error(`Error reloading configuration: ${error.message || String(error)}`);
        if (error instanceof Error && error.stack) {
          this.logger.debug(error.stack);
        }
      }
    };
  }

  /**
   * Initialize the translator (load config but don't start watching)
   */
  async initialize(): Promise<void> {
    try {
      // Register all translator engines first - this is critical for both CLI and VSCode
      registerAllTranslators();

      // Load configuration if provider implements it
      if (this.configProvider.load) {
        await this.configProvider.load();
      }

      // Load environment variables from translator.env (file is created by extension.ts on Start)
      await initTranslatorEnv(
        this.workspacePath,
        this.logger,
        this.fileSystem
      );

      // Get cache (using await since it's now async)
      this.cache = await this.getCache();
      if (!this.cache) {
        return;
      }

      // Create translator manager if it doesn't exist yet
      if (!this.translatorManager) {
        // Create workspace watcher
        const watcher = this.createWatcher();

        // Create callback for when configuration file changes
        const onConfigChanged = this.createConfigChangeHandler();

        // Create translator manager
        this.translatorManager = new TranslatorManager(
          this.fileSystem,
          this.logger,
          this.cache,
          this.workspacePath,
          watcher,
          this.configProvider,
          undefined,
          this.getPassphraseManager(),
          onConfigChanged
        );
      }
    } catch (error: any) {
      this.logger.error(`Error initializing translator: ${error.message || String(error)}`);

      // Cleanup on error
      if (this.translatorManager) {
        this.translatorManager.dispose();
        this.translatorManager = undefined;
      }

      throw error;
    }
  }

  /**
   * Start the translator and begin watching for file changes
   */
  async start(): Promise<void> {
    // Auto-initialize if translator manager is not available (e.g., after stop)
    if (!this.translatorManager) {
      await this.initialize();
    }

    // If still not initialized, surface a clear error
    if (!this.translatorManager) {
      throw new Error('Translator manager not initialized. Call initialize() before start()');
    }

    // Check if already running
    if (this.running) {
      this.logger.info('Translator already running');
      return;
    }

    try {
      // Load project configuration
      const projectConfig = await loadProjectConfig(
        this.workspacePath,
        this.configProvider,
        this.logger,
        this.fileSystem
      );

      // Start watching (guard for test environments where startWatching may be mocked out)
      const mgr: any = this.translatorManager as any;
      if (typeof mgr.startWatching === 'function') {
        // Start watching for file changes
        await mgr.startWatching(projectConfig);
      } else {
        this.logger.warn('TranslatorManager.startWatching not available. Skipping watcher startup (test/mock environment).');
      }

      // Show success message
      this.running = true;
      this.logger.info('Translator started');
    } catch (error: any) {
      this.logger.error(`Error starting translator: ${error.message || String(error)}`);

      // Cleanup on error - guard in case mocks don't provide a function
      if (this.translatorManager) {
        const disposer: unknown = (this.translatorManager as any).dispose;
        if (typeof disposer === 'function') {
          try {
            (disposer as Function).call(this.translatorManager);
          } catch {
            // ignore cleanup errors
          }
        }
        this.translatorManager = undefined;
      }

      throw error;
    }
  }

  /**
   * Stop the translator
   */
  stop(): void {
    if (!this.running) {
      this.logger.info('Translator not running');
      return;
    }

    // Dispose resources
    if (this.translatorManager) {
      const disposer: unknown = (this.translatorManager as any).dispose;
      if (typeof disposer === 'function') {
        try {
          (disposer as Function).call(this.translatorManager);
        } catch {
          // ignore cleanup errors in stop
        }
      }
      this.translatorManager = undefined;
    }

    this.running = false;
    this.logger.info('Translator stopped');
  }

  /**
   * Restart the translator
   */
  async restart(): Promise<void> {
    this.stop();
    await this.initialize();
    await this.start();
  }

  /**
   * Push translations to MateCat
   */
  async pushToMateCat(): Promise<void> {
    if (!this.translatorManager) throw new Error('Translator manager not initialized. Call initialize() before pushToMateCat()');

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pushToMateCat();
      this.logger.info('Successfully pushed translations to MateCat');
    } catch (e: any) {
      this.logger.error(`MateCat push failed: ${e.message}`);
    }
  }

  /**
   * Pull translations from MateCat
   */
  async pullFromMateCat(): Promise<void> {
    if (!this.translatorManager) throw new Error('Translator manager not initialized. Call initialize() before pullFromMateCat()');

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pullFromMateCat();
      this.logger.info('Successfully pulled translations from MateCat');
    } catch (e: any) {
      this.logger.error(`MateCat pull failed: ${e.message}`);
    }
  }

  /**
   * Translate a single file
   * @param filePath Relative path to the file from the workspace
   * @param forceTranslation Force translation even if target is up-to-date
   */
  async translateFile(filePath: string, forceTranslation: boolean = false): Promise<void> {
    if (!this.translatorManager) throw new Error('Translator manager not initialized. Call initialize() before translateFile()');

    try {
      // Load project configuration
      const projectConfig = await loadProjectConfig(
        this.workspacePath,
        this.configProvider,
        this.logger,
        this.fileSystem
      );

      // Create the absolute path to the file
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
      const uri = this.fileSystem.createUri(absolutePath);

      // Check if file exists
      const exists = await this.fileSystem.fileExists(uri);
      if (!exists) {
        this.logger.error(`Error: File not found: ${absolutePath}`);
        this.logger.error(`Please check the path and make sure the file exists.`);
        return;
      }

      // Check if file is supported
      const lowerFilePath = absolutePath.toLowerCase();
      if (!(lowerFilePath.endsWith('.json') ||
            lowerFilePath.endsWith('.md') ||
            lowerFilePath.endsWith('.mdx') ||
            lowerFilePath.endsWith('.yaml') ||
            lowerFilePath.endsWith('.yml'))) {
        this.logger.error(`Error: Unsupported file type: ${absolutePath}`);
        this.logger.error(`Supported file types: .json, .md, .mdx, .yaml, .yml`);
        return;
      }

      this.logger.info(`Translating single file: ${filePath}`);

      // Use the TranslatorManager to process the file
      await this.translatorManager.translateSingleFile(uri, projectConfig, forceTranslation);

      this.logger.info(`Translation of ${filePath} completed successfully`);
    } catch (e: any) {
      this.logger.error(`Translation of file failed: ${e.message}`);
      if (e.stack) {
        this.logger.debug(e.stack);
      }
    }
  }

  /**
   * Perform bulk translation of all source files in the project
   * @param force Force translation even if target is up-to-date
   * @returns Number of files processed
   */
  async bulkTranslate(force: boolean): Promise<number> {
    // Check for initialization
    if (!this.translatorManager) throw new Error('Translator manager not initialized. Call initialize() before bulkTranslate()');

    try {
      // Load project configuration
      const projectConfig = await loadProjectConfig(
        this.workspacePath,
        this.configProvider,
        this.logger,
        this.fileSystem
      );

      // Log the operation mode based on the force parameter
      if (force) {
        this.logger.info('Starting bulk translation of all project files (forced)...');
      } else {
        this.logger.info('Starting bulk translation of all project files (only updated files)...');
      }

      // Create progress reporting function
      const progressCallback = (current: number, total: number, file: string) => {
        const filename = path.basename(file);
        const percent = Math.round((current / total) * 100);
        this.logger.info(`[${percent}%] Translating file ${current}/${total}: ${filename}`);
      };

      const filesProcessed = await this.translatorManager.bulkTranslate(projectConfig, progressCallback, force);
      this.logger.info(`Bulk translation completed: ${filesProcessed} files processed`);

      return filesProcessed;
    } catch (e: any) {
      this.logger.error(`Bulk translation failed: ${e.message}`);
      if (e.stack) {
        this.logger.debug(e.stack);
      }
      return 0;
    }
  }

  /**
   * Check if the translator is currently running (watching for file changes)
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if the translator manager is available (indicates initialization is complete)
   */
  isReady(): boolean {
    return this.translatorManager !== undefined;
  }

  /**
   * Get the current status of the translator
   */
  getStatus(): { initialized: boolean; running: boolean } {
    return {
      initialized: this.isReady(),
      running: this.isRunning()
    };
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (this.translatorManager) {
      this.translatorManager.dispose();
      this.translatorManager = undefined;
    }
    this.running = false;
  }
}