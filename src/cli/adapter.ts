import * as path from 'path';
import * as fs from 'fs';
import { TranslatorManager } from '../core/translatorManager';
import { loadProjectConfig } from '../core/config';
import { initTranslatorEnv } from '../core/util/env';
import { NodeFileSystem, nodeFileSystem } from '../core/util/fs';
import { ConsoleLogger } from '../core/util/logger';
import { CliWorkspaceWatcher } from './watcher';
import { SQLiteCache } from '../core/cache/sqlite';
import { CliConfigProvider } from './config';

/**
 * CLI adapter for the TranslatorManager
 */
export class CLITranslatorAdapter {
  private translatorManager: TranslatorManager | null = null;
  private logger = new ConsoleLogger();
  private fileSystem = new NodeFileSystem();
  private cache: SQLiteCache | undefined;
  private configProvider: CliConfigProvider;

  /**
   * Create a CLI translator adapter
   * @param workspacePath Path to the project workspace
   * @param configPath Path to the project's .translate.json file
   */
  constructor(private workspacePath: string, configPath: string) {
    this.workspacePath = workspacePath;
    this.configProvider = new CliConfigProvider(nodeFileSystem, this.logger, configPath);
  }

  /**
   * Get or create the cache
   */
  private getCache(dbMustExist = false): SQLiteCache | undefined {
    const dbPath = path.join(this.workspacePath, '.i18n-cache', 'translation.db');

    if (dbMustExist && !fs.existsSync(dbPath)) {
      console.error(`${dbPath}: Translation cache not found. Start the translator to create it.`);
      return undefined;
    }

    // Ensure the cache directory exists
    const cacheDir = path.dirname(dbPath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    this.cache = new SQLiteCache(dbPath, this.logger);
    return this.cache;
  }

  /**
   * Start the translator
   */
  async start(): Promise<void> {
    // Check if already running
    if (this.translatorManager) {
      console.info('Translator already running');
      return;
    }

    try {
      // Load CLI configuration
      await this.configProvider.load();

      // Initialize environment
      await initTranslatorEnv(
        this.workspacePath,
        this.logger,
        this.fileSystem,
        async (path: string) => {
          console.info(`File opened: ${path}`);
        }
      );

      // Get cache
      this.cache = this.getCache();
      if (!this.cache) {
        return;
      }

      // Create workspace watcher
      const watcher = new CliWorkspaceWatcher(this.fileSystem, this.logger, this.workspacePath);

      // Create translator manager
      this.translatorManager = new TranslatorManager(
        this.fileSystem,
        this.logger,
        this.cache,
        this.workspacePath,
        watcher,
        this.configProvider
      );

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
      console.info('Translator started');
    } catch (error: any) {
      console.error(`Error starting translator: ${error.message || String(error)}`);

      // Cleanup on error
      if (this.translatorManager) {
        this.translatorManager.dispose();
        this.translatorManager = null;
      }

      throw error;
    }
  }

  /**
   * Stop the translator
   */
  stop(): void {
    if (!this.translatorManager) {
      console.info('Translator not running');
      return;
    }

    // Dispose resources
    this.translatorManager.dispose();
    this.translatorManager = null;

    console.info('Translator stopped');
  }

  /**
   * Restart the translator
   */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * Push translations to MateCat
   */
  async pushToMateCat(): Promise<void> {
    if (!this.translatorManager) {
      console.info('Translator not running. Start the translator first.');
      return;
    }

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pushToMateCat();
      console.info('Successfully pushed translations to MateCat');
    } catch (e: any) {
      console.error(`MateCat push failed: ${e.message}`);
    }
  }

  /**
   * Pull translations from MateCat
   */
  async pullFromMateCat(): Promise<void> {
    if (!this.translatorManager) {
      console.info('Translator not running. Start the translator first.');
      return;
    }

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pullFromMateCat();
      console.info('Successfully pulled translations from MateCat');
    } catch (e: any) {
      console.error(`MateCat pull failed: ${e.message}`);
    }
  }

  /**
   * Perform bulk translation of all source files in the project
   */
  async bulkTranslate(): Promise<void> {
    if (!this.translatorManager) {
      console.info('Translator not running. Start the translator first.');
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

      console.info('Starting bulk translation of all project files...');

      // Create progress reporting function
      const progressCallback = (current: number, total: number, file: string) => {
        const filename = path.basename(file);
        const percent = Math.round((current / total) * 100);
        console.info(`[${percent}%] Translating file ${current}/${total}: ${filename}`);
      };

      // Call the bulk translate method with progress reporting
      const filesProcessed = await this.translatorManager.bulkTranslate(projectConfig, progressCallback);

      console.info(`Bulk translation completed: ${filesProcessed} files processed`);
    } catch (e: any) {
      console.error(`Bulk translation failed: ${e.message}`);
      if (e.stack) {
        console.error(e.stack);
      }
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (this.translatorManager) {
      this.translatorManager.dispose();
      this.translatorManager = null;
    }
  }
}