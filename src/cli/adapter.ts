import { NodeFileSystem, nodeFileSystem } from '../core/util/fs';
import { ConsoleLogger, LogLevel } from '../core/util/logger';
import { CliWorkspaceWatcher } from './watcher';
import { CliConfigProvider } from './config';
import { TranslatorAdapter } from '../core/adapters/baseAdapter';
import { WorkspaceWatcher } from '../core/util/watcher';

/**
 * CLI adapter for the TranslatorManager
 */
export class CLITranslatorAdapter extends TranslatorAdapter {
  private cliConfigProvider: CliConfigProvider;

  /**
   * Create a CLI translator adapter
   * @param workspacePath Path to the project workspace
   * @param configPath Path to the project's .translate.json file
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
  protected async handleFileOpen(path: string): Promise<void> {
    this.logger.info(`File opened: ${path}`);
  }

  /**
   * Implementation of the abstract method to create a workspace watcher for CLI
   */
  protected createWatcher(): WorkspaceWatcher {
    return new CliWorkspaceWatcher(this.fileSystem, this.logger, this.workspacePath);
  }

  /**
   * Initialize the CLI adapter
   * Overrides the base method to add CLI-specific initialization
   */
  async initialize(): Promise<void> {
    try {
      // Load CLI configuration
      await this.cliConfigProvider.load();

      // Call the base class initialize which now handles loading .translator.env
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
}