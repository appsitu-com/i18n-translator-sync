import { NodeFileSystem, nodeFileSystem } from '../core/util/fs';
import { ConsoleLogger, LogLevel } from '../core/util/baseLogger';
import { CliWorkspaceWatcher } from './watcher';
import { CliConfigProvider } from './cliConfig';
import { TranslatorAdapter } from '../core/adapters/baseAdapter';
import { WorkspaceWatcher } from '../core/util/watcher';
import { EnvPassphraseManager } from '../core/secrets/envPassphraseManager';
import { loadProjectConfig } from '../core/coreConfig';
import * as path from 'path';

/**
 * CLI adapter for the TranslatorManager
 */
export class CLITranslatorAdapter extends TranslatorAdapter {
  private cliConfigProvider: CliConfigProvider;
  private passphraseManager = new EnvPassphraseManager('TRANSLATOR_KEY');

  /**
   * Create a CLI translator adapter
   * @param workspacePath Path to the project workspace
   * @param configPath Path to the project's translator.json file
   */
  constructor(workspacePath: string, configPath: string) {
    const logger = new ConsoleLogger();

    // Enable debug logging if DEBUG environment variable is set
    if (process.env.DEBUG) {
      logger.setLevel(LogLevel.Debug);
    }

    const fileSystem = new NodeFileSystem();
    const configProvider = new CliConfigProvider(nodeFileSystem, logger, configPath);

    super(workspacePath, logger, fileSystem, configProvider);
    this.cliConfigProvider = configProvider;
  }

  /**
   * Implementation of the abstract method to handle file opens in CLI
   * Simply logs the file open since CLI doesn't have a UI to display files
   */
  protected async openDocument(path: string): Promise<void> {
    this.logger.info(`File opened: ${path}`);
  }

  /**
   * Implementation of the abstract method to create a workspace watcher for CLI
   */
  protected createWatcher(): WorkspaceWatcher {
    return new CliWorkspaceWatcher(this.fileSystem, this.logger, this.workspacePath);
  }

  protected getPassphraseManager() {
    return this.passphraseManager;
  }

  /**
   * Initialize the CLI adapter
   * Overrides the base method to add CLI-specific initialization
   */
  async initialize(): Promise<void> {
    try {
      // Load CLI configuration
      await this.cliConfigProvider.load();

      // Call the base class initialize which now handles loading translator.env
      await super.initialize();
    } catch (error: any) {
      this.logger.error(`Error initializing translator: ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Translate a single file with CLI-specific logic
   * @param filePath Relative path to the file from the workspace
   */
  async translateFile(filePath: string): Promise<void> {
    // Get force flag from command line arguments
    const forceTranslation = process.argv.includes('--force');

    // Call the base implementation with the force parameter
    await super.translateFile(filePath, forceTranslation);
  }

  /**
   * Export cache to CSV file
   * @param csvPath Optional path to CSV file (defaults to csvPath from config)
   */
  async exportCache(csvPath?: string): Promise<void> {
    try {
      // Get the cache
      const cache = await this.getCache(true);
      if (!cache) {
        this.logger.error('Cache not available. Start the translator first to create the cache.');
        return;
      }

      // Determine the CSV path
      let outputPath: string;
      if (csvPath) {
        outputPath = path.isAbsolute(csvPath) ? csvPath : path.join(this.workspacePath, csvPath);
      } else {
        // Load config to get default csvPath
        const config = await loadProjectConfig(
          this.workspacePath,
          this.configProvider,
          this.logger,
          this.fileSystem
        );
        const defaultCsvPath = config.csvExportPath || 'translator.csv';
        outputPath = path.isAbsolute(defaultCsvPath)
          ? defaultCsvPath
          : path.join(this.workspacePath, defaultCsvPath);
      }

      this.logger.info(`Exporting cache to ${outputPath}...`);
      await cache.exportCSV(outputPath);
      this.logger.info(`Cache exported successfully to ${outputPath}`);
    } catch (error: any) {
      this.logger.error(`Failed to export cache: ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Import cache from CSV file
   * @param csvPath Path to CSV file to import
   */
  async importCache(csvPath: string): Promise<void> {
    try {
      // Get the cache
      const cache = await this.getCache();
      if (!cache) {
        this.logger.error('Cache not available.');
        return;
      }

      // Resolve the CSV path
      const inputPath = path.isAbsolute(csvPath) ? csvPath : path.join(this.workspacePath, csvPath);

      this.logger.info(`Importing cache from ${inputPath}...`);
      const count = await cache.importCSV(inputPath);
      this.logger.info(`Cache import completed. Imported ${count} translations.`);
    } catch (error: any) {
      this.logger.error(`Failed to import cache: ${error.message || String(error)}`);
      throw error;
    }
  }
}