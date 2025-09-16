import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { TranslatorManager } from '../translatorManager';
import { loadProjectConfig } from '../config';
import { Logger } from '../util/logger';
import { FileSystem } from '../util/fs';
import { WorkspaceWatcher } from '../util/watcher';
import { SQLiteCache } from '../cache/sqlite';
import { ConfigProvider } from '../config';
import { initTranslatorEnv } from '../util/env';
import { registerAllTranslators } from '../../translators';
import { getApiKeyEnvVars } from '../../types/env';

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
  protected abstract handleFileOpen(path: string): Promise<void>;

  /**
   * Abstract method to create a workspace watcher appropriate for the environment
   */
  protected abstract createWatcher(): WorkspaceWatcher;

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
   * Load environment variables from .translator.env file in the workspace
   * This is used by both CLI and VSCode adapters
   */
  protected async loadEnvironmentVariables(): Promise<void> {
    // Explicitly load .translator.env from the workspace path
    const envFilePath = path.join(this.workspacePath, '.translator.env');
    if (fs.existsSync(envFilePath)) {
      this.logger.info(`Loading environment variables from ${envFilePath}`);
      const result = dotenv.config({ path: envFilePath, override: true });
      if (result.error) {
        this.logger.error(`Error loading .translator.env: ${result.error}`);
      } else {
        this.logger.info(`Successfully loaded API keys from .translator.env`);

        // Log environment variables (without showing the actual keys)
        const apiKeyVars = getApiKeyEnvVars();
        for (const varName of apiKeyVars) {
          if (process.env[varName]) {
            // this.logger.info(`Found ${varName}: ${process.env[varName].substring(0, 3)}...`);
          } else {
            this.logger.warn(`Missing ${varName} environment variable`);
          }
        }
      }
    } else {
      this.logger.warn(`No .translator.env file found at ${envFilePath}`);
    }

    // Initialize environment
    await initTranslatorEnv(
      this.workspacePath,
      this.logger,
      this.fileSystem,
      this.handleFileOpen.bind(this)
    );
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

      // Load environment variables from .translator.env
      await this.loadEnvironmentVariables();

      // Get cache (using await since it's now async)
      this.cache = await this.getCache();
      if (!this.cache) {
        return;
      }

      // Create translator manager if it doesn't exist yet
      if (!this.translatorManager) {
        // Create workspace watcher
        const watcher = this.createWatcher();

        // Create translator manager
        this.translatorManager = new TranslatorManager(
          this.fileSystem,
          this.logger,
          this.cache,
          this.workspacePath,
          watcher,
          this.configProvider
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
    if (!this.translatorManager) throw new Error('Translator manager not initialized. Call initialize() before start()');

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

      // Start watching
      await this.translatorManager.startWatching(projectConfig);

      // Show success message
      this.running = true;
      this.logger.info('Translator started');
    } catch (error: any) {
      this.logger.error(`Error starting translator: ${error.message || String(error)}`);

      // Cleanup on error
      if (this.translatorManager) {
        this.translatorManager.dispose();
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
      this.translatorManager.dispose();
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