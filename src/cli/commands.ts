import { Command } from 'commander';
import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import { NodeFileSystem } from '../core/util/fs';
import { ConsoleLogger, LogLevel } from '../core/util/logger';
import { CliConfigProvider } from './config';
import { CliWorkspaceWatcher } from './watcher';
import { NodeSQLiteCache } from '../core/cache/sqlite';
import { initTranslatorEnv } from '../core/util/env';
import { TranslatorManager } from '../core/translatorManager';
import { loadProjectConfig } from '../core/config';

/**
 * CLI command implementation
 */
export class CliCommands {
  private program: Command;
  private logger: ConsoleLogger;
  private fs: NodeFileSystem;
  private configProvider!: CliConfigProvider;
  private translatorManager: TranslatorManager | null = null;
  private isWatching = false;

  constructor() {
    // Initialize core services
    this.fs = new NodeFileSystem();
    this.logger = new ConsoleLogger();

    // Create program
    this.program = new Command()
      .name('i18n-translator')
      .description('i18n Translator CLI - Translation management tool')
      .version('0.1.2'); // This should be updated to match package.json

    // Configure commands
    this.configureCommands();
  }  /**
   * Configure all CLI commands
   */
  private configureCommands(): void {
    this.program
      .command('start')
      .description('Start watching for translation file changes')
      .option('-c, --config <path>', 'Path to config file (.translate.json)', '.translate.json')
      .option('-w, --workspace <path>', 'Path to workspace root', process.cwd())
      .option('-v, --verbose', 'Enable verbose logging')
      .action((options) => this.startCommand(options));

    this.program
      .command('push')
      .description('Push translations to targets')
      .option('-c, --config <path>', 'Path to config file (.translate.json)', '.translate.json')
      .option('-w, --workspace <path>', 'Path to workspace root', process.cwd())
      .option('-v, --verbose', 'Enable verbose logging')
      .action((options) => this.pushCommand(options));

    this.program
      .command('pull')
      .description('Pull translations from source')
      .option('-c, --config <path>', 'Path to config file (.translate.json)', '.translate.json')
      .option('-w, --workspace <path>', 'Path to workspace root', process.cwd())
      .option('-v, --verbose', 'Enable verbose logging')
      .action((options) => this.pullCommand(options));
  }

  /**
   * Initialize configuration and pipeline
   */
  private async initialize(options: any): Promise<boolean> {
    try {
      // Set log level based on verbose flag
      this.logger.setLevel(options.verbose ? LogLevel.Debug : LogLevel.Info);

      // Normalize workspace path
      const workspacePath = path.resolve(options.workspace);
      this.logger.info(`Using workspace: ${workspacePath}`);

      // Load environment variables
      const envPath = path.join(workspacePath, '.translator.env');
      await initTranslatorEnv(workspacePath, this.logger);

      // Initialize config provider
      const configPath = path.join(workspacePath, options.config);
      this.configProvider = new CliConfigProvider(this.fs, this.logger, configPath);
      await this.configProvider.load();

      // Initialize cache
      const cachePath = path.join(workspacePath, '.translator-cache.db');
      const cache = new NodeSQLiteCache(this.logger, cachePath);
      await cache.initialize();

      // Initialize watcher
      const watcher = new CliWorkspaceWatcher(
        this.fs,
        this.logger,
        workspacePath
      );

      // Create translator manager
      this.translatorManager = new TranslatorManager(
        this.fs,
        this.logger,
        cache,
        workspacePath,
        watcher,
        this.configProvider
      );
      return true;
    } catch (err) {
      this.logger.error(`Initialization failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Start command handler
   */
  private async startCommand(options: any): Promise<void> {
    if (!await this.initialize(options)) {
      process.exit(1);
    }

    try {
      const workspacePath = path.resolve(options.workspace);

      // Load project configuration
      const projectConfig = await loadProjectConfig(
        workspacePath,
        this.configProvider,
        this.logger,
        this.fs
      );

      this.logger.info('Starting translation watcher...');
      await this.translatorManager!.startWatching(projectConfig);
      this.isWatching = true;

      // Handle shutdown signals
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

      this.logger.info('Watching for changes (Press Ctrl+C to stop)');

      // Keep process running
      setInterval(() => {
        // Ping to keep the process alive
      }, 5000);
    } catch (err) {
      this.logger.error(`Failed to start watcher: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  /**
   * Push command handler
   */
  private async pushCommand(options: any): Promise<void> {
    if (!await this.initialize(options)) {
      process.exit(1);
    }

    try {
      const workspacePath = path.resolve(options.workspace);

      // Load project configuration
      const projectConfig = await loadProjectConfig(
        workspacePath,
        this.configProvider,
        this.logger,
        this.fs
      );

      this.logger.info('Pushing translations...');
      await this.translatorManager!.pushTranslations(projectConfig);
      this.logger.info('Push complete');
      process.exit(0);
    } catch (err) {
      this.logger.error(`Failed to push translations: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  /**
   * Pull command handler
   */
  private async pullCommand(options: any): Promise<void> {
    if (!await this.initialize(options)) {
      process.exit(1);
    }

    try {
      const workspacePath = path.resolve(options.workspace);

      // Load project configuration
      const projectConfig = await loadProjectConfig(
        workspacePath,
        this.configProvider,
        this.logger,
        this.fs
      );

      this.logger.info('Pulling translations...');
      await this.translatorManager!.pullTranslations(projectConfig);
      this.logger.info('Pull complete');
      process.exit(0);
    } catch (err) {
      this.logger.error(`Failed to pull translations: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  /**
   * Shutdown handler
   */
  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down...');

    if (this.isWatching && this.translatorManager) {
      await this.translatorManager.stopWatching();
      this.isWatching = false;
    }    this.logger.info('Shutdown complete');
    process.exit(0);
  }

  /**
   * Parse command line arguments and execute commands
   */
  public async run(argv: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (err) {
      this.logger.error(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
}