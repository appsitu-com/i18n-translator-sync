import { FileSystem, IUri } from './util/fs';
import { Logger } from './util/logger';
import { TranslationCache } from './cache/sqlite';
import { Disposable, FileRenameEvent, WorkspaceWatcher } from './util/watcher';
import { TranslateProjectConfig, ConfigProvider } from './config';
import { TranslatorPipeline } from './pipeline';
import { MateCatService, MateCatSettings } from './matecat';
import * as path from 'path';

/**
 * TranslatorManager manages the translation process for both CLI and VSCode extension
 */
export class TranslatorManager {
  private watchers: Disposable[] = [];
  private pipeline: TranslatorPipeline;
  private cache: TranslationCache;
  private isWatching: boolean = false;
  private mateCatService: MateCatService | null = null;

  constructor(
    private fileSystem: FileSystem,
    private logger: Logger,
    cache: TranslationCache,
    private workspacePath: string,
    private workspaceWatcher: WorkspaceWatcher,
    private configProvider: ConfigProvider
  ) {
    this.cache = cache;
    this.pipeline = new TranslatorPipeline(fileSystem, logger, cache);

    // Initialize MateCat integration
    this.initializeMateCat();
  }

  /**
   * Initialize MateCat integration
   * @private
   */
  private initializeMateCat(): void {
    try {
      this.mateCatService = new MateCatService(this.logger);
      this.logger.info('MateCat integration initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize MateCat: ${error}`);
      this.mateCatService = null;
    }
  }

  /**
   * Start watching for file changes and translate
   */
  async startWatching(config: TranslateProjectConfig): Promise<void> {
    if (this.isWatching) {
      this.logger.warn('Already watching for file changes');
      return;
    }

    this.logger.info('Starting to watch for file changes');

    // Process all existing files first
    await this.processExistingSourceFiles(config);

    // Create file watchers for each source path
    for (const sourcePath of config.sourcePaths) {
      // Normalize path for consistency across platforms
      const normalizedPath = sourcePath.replace(/\\/g, '/');

      // Create glob pattern for the file watcher
      const pattern = `**/${normalizedPath}/**`;

      this.logger.debug(`Creating watcher with pattern: ${pattern}`);

      // Create file watcher
      const watcher = this.workspaceWatcher.createFileSystemWatcher(
        pattern,
        false, // ignoreCreateEvents
        false, // ignoreChangeEvents
        false  // ignoreDeleteEvents
      );

      // Set up event handlers
      watcher.onDidCreate(uri => this.onAddOrChange(uri, config));
      watcher.onDidChange(uri => this.onAddOrChange(uri, config));
      watcher.onDidDelete(uri => this.onDelete(uri, config));

      // Add watcher to disposables
      this.watchers.push(watcher);

      this.logger.info(`Watcher created for ${pattern}`);
    }

    // Set up rename handler
    this.workspaceWatcher.onDidRenameFiles(e => this.onRename(e, config));

    this.isWatching = true;
    this.logger.info('Started watching for file changes');
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) {
      this.logger.warn('Not watching for file changes');
      return;
    }

    // Dispose all watchers
    for (const watcher of this.watchers) {
      watcher.dispose();
    }

    this.watchers = [];
    this.isWatching = false;

    this.logger.info('Stopped watching for file changes');
  }

  /**
   * Handler for file creation or modification
   */
  private async onAddOrChange(uri: IUri, config: TranslateProjectConfig): Promise<void> {
    try {
      this.logger.info(`File changed: ${uri.fsPath}`);

      // Process the file using the pipeline
      await this.pipeline.processFile(
        uri,
        this.workspacePath,
        config,
        { get: <T>(section: string, defaultValue?: T) => config[section as keyof TranslateProjectConfig] as T }
      );

      this.logger.info(`Successfully processed file: ${uri.fsPath}`);
    } catch (error) {
      this.logger.error(`Error processing file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.logger.debug(error.stack);
      }
    }
  }

  /**
   * Handler for file deletion
   */
  private async onDelete(uri: IUri, config: TranslateProjectConfig): Promise<void> {
    try {
      this.logger.info(`File deleted: ${uri.fsPath}`);

      // Remove translations for the file
      await this.pipeline.removeFile(uri, this.workspacePath, config);

      this.logger.info(`Successfully removed translations for file: ${uri.fsPath}`);
    } catch (error) {
      this.logger.error(`Error removing translations for ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.logger.debug(error.stack);
      }
    }
  }

  /**
   * Handler for file rename events
   */
  private async onRename(e: FileRenameEvent, config: TranslateProjectConfig): Promise<void> {
    for (const file of e.files) {
      try {
        const oldPath = file.oldUri.fsPath.replace(/\\/g, '/');
        const newPath = file.newUri.fsPath.replace(/\\/g, '/');

        this.logger.info(`File renamed: ${oldPath} -> ${newPath}`);

        // Check if the file is within any source path
        let isInSourcePath = false;
        for (const sourcePath of config.sourcePaths) {
          const fullSourcePath = path.join(this.workspacePath, sourcePath).replace(/\\/g, '/');
          if (oldPath.startsWith(fullSourcePath) || newPath.startsWith(fullSourcePath)) {
            isInSourcePath = true;
            break;
          }
        }

        if (isInSourcePath) {
          // First remove translations for the old file
          await this.pipeline.removeFile(file.oldUri, this.workspacePath, config);

          // Then process the new file
          await this.pipeline.processFile(
            file.newUri,
            this.workspacePath,
            config,
            { get: <T>(section: string, defaultValue?: T) => config[section as keyof TranslateProjectConfig] as T }
          );

          this.logger.info(`Successfully handled rename from ${oldPath} to ${newPath}`);
        }
      } catch (error) {
        this.logger.error(`Error handling rename for ${file.newUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
          this.logger.debug(error.stack);
        }
      }
    }
  }

  /**
   * Perform bulk translation of all source files
   * @param config The project configuration
   * @param progressCallback Optional callback to report progress
   * @returns Number of files processed
   */
  async bulkTranslate(
    config: TranslateProjectConfig,
    progressCallback?: (current: number, total: number, file: string) => void
  ): Promise<number> {
    this.logger.info('Starting bulk translation of all source files');

    let filesProcessed = 0;
    let totalFiles = 0;
    let files: IUri[] = [];

    try {
      // First pass: collect all files to translate
      for (const sourcePath of config.sourcePaths) {
        const fullSourcePath = path.join(this.workspacePath, sourcePath);
        const sourceUri = this.fileSystem.createUri(fullSourcePath);

        // Find all files in the source path
        const pathFiles = await this.findAllFilesInDir(sourceUri);

        // Filter files by supported extensions
        const supportedFiles = pathFiles.filter(fileUri => {
          const filePath = fileUri.fsPath.toLowerCase();
          return filePath.endsWith('.json') || filePath.endsWith('.md') ||
                 filePath.endsWith('.mdx') || filePath.endsWith('.yaml') ||
                 filePath.endsWith('.yml');
        });

        files = [...files, ...supportedFiles];
      }

      totalFiles = files.length;
      this.logger.info(`Found ${totalFiles} files to translate`);

      // Second pass: process each file
      for (let i = 0; i < files.length; i++) {
        const fileUri = files[i];

        try {
          if (progressCallback) {
            progressCallback(i + 1, totalFiles, fileUri.fsPath);
          }

          this.logger.info(`Bulk translating file ${i + 1}/${totalFiles}: ${fileUri.fsPath}`);

          // Process the file using the pipeline
          await this.pipeline.processFile(
            fileUri,
            this.workspacePath,
            config,
            { get: <T>(section: string, defaultValue?: T) => config[section as keyof TranslateProjectConfig] as T }
          );

          filesProcessed++;
        } catch (error) {
          this.logger.error(`Error processing file ${fileUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
          if (error instanceof Error && error.stack) {
            this.logger.debug(error.stack);
          }
        }
      }

      this.logger.info(`Bulk translation complete: processed ${filesProcessed}/${totalFiles} files successfully`);
    } catch (error) {
      this.logger.error(`Error during bulk translation: ${error instanceof Error ? error.message : String(error)}`);
    }

    return filesProcessed;
  }

  /**
   * Push all translations
   */
  async pushTranslations(config: TranslateProjectConfig): Promise<void> {
    this.logger.info('Pushing all translations');

    // Use the bulk translate method to process all files
    await this.bulkTranslate(config);

    this.logger.info('Push completed');
  }

  /**
   * Pull all translations
   */
  async pullTranslations(config: TranslateProjectConfig): Promise<void> {
    this.logger.info('Pulling all translations');

    // TODO: Implement pull translations functionality
    // This would typically involve refreshing translations from source

    this.logger.info('Pull completed');
  }

  /**
   * Get MateCat settings from the config provider
   */
  private getMateCatSettings(): MateCatSettings {
    return {
      pushUrl: this.configProvider.get<string>('translator.matecat.pushUrl', ''),
      pullUrl: this.configProvider.get<string>('translator.matecat.pullUrl', ''),
      apiKey: this.configProvider.get<string>('translator.matecat.apiKey', ''),
      projectId: this.configProvider.get<string>('translator.matecat.projectId', ''),
      pullMethod: this.configProvider.get<'GET' | 'POST'>('translator.matecat.pullMethod', 'GET'),
      extraHeaders: this.configProvider.get<Record<string, string>>('translator.matecat.extraHeaders', {})
    };
  }

  /**
   * Process all existing source files
   * This is called when the watcher starts to ensure all files are up to date
   */
  private async processExistingSourceFiles(config: TranslateProjectConfig): Promise<void> {
    this.logger.info('Scanning existing source files...');

    try {
      let filesProcessed = 0;

      // Process each source path
      for (const sourcePath of config.sourcePaths) {
        const fullSourcePath = path.join(this.workspacePath, sourcePath);

        // Find all files in the source path
        const files = await this.findAllFilesInDir(this.fileSystem.createUri(fullSourcePath));

        this.logger.info(`Found ${files.length} files in source path: ${sourcePath}`);

        // Process each file
        for (const fileUri of files) {
          try {
            // Check if file is supported for translation (could add more filters here)
            const filePath = fileUri.fsPath.toLowerCase();
            if (filePath.endsWith('.json') || filePath.endsWith('.md') ||
                filePath.endsWith('.mdx') || filePath.endsWith('.yaml') ||
                filePath.endsWith('.yml')) {

              await this.pipeline.processFile(
                fileUri,
                this.workspacePath,
                config,
                { get: <T>(section: string, defaultValue?: T) => config[section as keyof TranslateProjectConfig] as T }
              );

              filesProcessed++;
            }
          } catch (error) {
            this.logger.error(`Error processing existing file ${fileUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      this.logger.info(`Initial scan complete: processed ${filesProcessed} files`);
    } catch (error) {
      this.logger.error(`Error scanning source files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Recursively find all files in a directory
   */
  private async findAllFilesInDir(dirUri: IUri): Promise<IUri[]> {
    const result: IUri[] = [];

    try {
      // Read directory contents
      const entries = await this.fileSystem.readDirectory(dirUri);

      // Process each entry
      for (const entry of entries) {
        const entryUri = this.fileSystem.joinPath(dirUri, entry.name);

        if (!entry.isDirectory) {
          // It's a file
          result.push(entryUri);
        } else {
          // It's a directory, recursively process it
          const subDirFiles = await this.findAllFilesInDir(entryUri);
          result.push(...subDirFiles);
        }
      }
    } catch (error) {
      this.logger.error(`Error reading directory ${dirUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Push translations to MateCat
   */
  async pushToMateCat(): Promise<void> {
    this.logger.info('Pushing translations to MateCat');

    if (!this.mateCatService) {
      this.initializeMateCat();
      if (!this.mateCatService) {
        throw new Error('MateCat integration not available');
      }
    }

    // Get MateCat settings from config provider
    const settings = this.getMateCatSettings();

    // Push translations
    await this.mateCatService.pushCacheToMateCat(this.cache, settings,
      (message: string) => this.logger.info(message));

    this.logger.info('Successfully pushed translations to MateCat');
  }

  /**
   * Pull translations from MateCat
   */
  async pullFromMateCat(): Promise<void> {
    this.logger.info('Pulling translations from MateCat');

    if (!this.mateCatService) {
      this.initializeMateCat();
      if (!this.mateCatService) {
        throw new Error('MateCat integration not available');
      }
    }

    // Get MateCat settings from config provider
    const settings = this.getMateCatSettings();

    // Pull translations
    await this.mateCatService.pullReviewedFromMateCat(this.cache, settings,
      (message: string) => this.logger.info(message));

    this.logger.info('Successfully pulled translations from MateCat');
  }

  /**
   * Close resources
   */
  dispose(): void {
    this.stopWatching();
    this.cache.close();
  }
}