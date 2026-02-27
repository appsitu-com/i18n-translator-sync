import { FileSystem, IUri } from './util/fs';
import { Logger } from './util/baseLogger';
import { TranslationCache } from './cache/sqlite';
import { Disposable, FileRenameEvent, WorkspaceWatcher } from './util/watcher';
import { TranslateProjectConfig, ConfigProvider } from './coreConfig';
import { TranslatorPipeline } from './pipeline';
import { MateCatService, MateCatSettings } from './matecat';
import { ITranslationExecutor } from './translationExecutor';
import { IPassphraseManager } from './secrets/passphraseManager';
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
    private configProvider: ConfigProvider,
    executor?: ITranslationExecutor,
    passphraseManager?: IPassphraseManager
  ) {
    this.cache = cache;
    this.pipeline = new TranslatorPipeline(fileSystem, logger, cache, executor, passphraseManager);

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
   * @param config The project configuration
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

      // Create the full path to check if it's a file
      const fullSourcePath = path.join(this.workspacePath, sourcePath);
      const sourceUri = this.fileSystem.createUri(fullSourcePath);

      // Check if this is a file or directory
      const isFilePath = await this.isFile(sourceUri);

      // Create appropriate glob pattern for the file watcher
      let pattern: string;

      if (isFilePath) {
        // For a file, watch that specific file directly
        pattern = normalizedPath;
        this.logger.debug(`Creating file-specific watcher with pattern: ${pattern}`);
      } else {
        // For a directory, watch all files in that directory recursively
        pattern = `${normalizedPath}/**`;
        this.logger.debug(`Creating directory watcher with pattern: ${pattern}`);
      }

      // Create file watcher
      const watcher = this.workspaceWatcher.createFileSystemWatcher();

      // Set up event handlers using the new watch method
      watcher.watch(pattern, {
        onDidCreate: uri => this.onAddOrChange(uri, config),
        onDidChange: uri => this.onAddOrChange(uri, config),
        onDidDelete: uri => this.onDelete(uri, config)
      });

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
   * @param uri The URI of the file that changed
   * @param config The project configuration
   */
  private async onAddOrChange(
    uri: IUri,
    config: TranslateProjectConfig
  ): Promise<void> {
    try {
      this.logger.info(`File changed: ${uri.fsPath}`);

      // For file change events, we always process the file as the content might have changed
      // The timestamp-based check happens inside the pipeline.processFile method
      await this.pipeline.processFile(
        uri,
        this.workspacePath,
        config,
        this.configProvider
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
  private async onRename(
    e: FileRenameEvent,
    config: TranslateProjectConfig
  ): Promise<void> {
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
            this.configProvider
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
   * Checks if a path is a file (rather than a directory)
   * @param uri URI to check
   * @returns True if the path exists and is a file
   */
  private async isFile(uri: IUri): Promise<boolean> {
    try {
      // Check if path exists
      const exists = await this.fileSystem.fileExists(uri);
      if (!exists) {
        this.logger.warn(`Path does not exist: ${uri.fsPath}`);
        return false;
      }

      // Check if it's a directory
      const isDir = await this.fileSystem.isDirectory(uri);
      return !isDir;
    } catch (error) {
      this.logger.error(`Error checking if path is file: ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Check if a file is supported for translation
   * @param filePath Path to check
   * @returns True if supported
   */
  private isSupportedFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return lowerPath.endsWith('.json') ||
           lowerPath.endsWith('.md') ||
           lowerPath.endsWith('.mdx') ||
           lowerPath.endsWith('.yaml') ||
           lowerPath.endsWith('.yml');
  }

  /**
   * Perform bulk translation of all source files
   * @param config The project configuration
   * @param progressCallback Optional callback to report progress
   * @param force Force translation even if target is up to date
   * @returns Number of files processed
   */
  async bulkTranslate(
    config: TranslateProjectConfig,
    progressCallback?: (current: number, total: number, file: string) => void,
    force: boolean = false
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

        // Check if this is a file or directory
        const isFilePath = await this.isFile(sourceUri);

        if (isFilePath) {
          // It's a single file - add it directly if it's supported
          if (this.isSupportedFile(fullSourcePath)) {
            files.push(sourceUri);
            this.logger.info(`Added single file for translation: ${fullSourcePath}`);
          } else {
            this.logger.warn(`Skipping unsupported file: ${fullSourcePath}`);
          }
        } else {
          // It's a directory - find all files recursively
          try {
            // Find all files in the source path
            const pathFiles = await this.findAllFilesInDir(sourceUri);

            // Filter files by supported extensions
            const supportedFiles = pathFiles.filter(fileUri =>
              this.isSupportedFile(fileUri.fsPath)
            );

            files = [...files, ...supportedFiles];
            this.logger.info(`Found ${supportedFiles.length} files in directory: ${fullSourcePath}`);
          } catch (error) {
            this.logger.error(`Error processing source path ${fullSourcePath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
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
                this.configProvider,
                force // Force translation flag
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
  async pullTranslations(_config: TranslateProjectConfig): Promise<void> {
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
   * @param config The project configuration
   */
  private async processExistingSourceFiles(config: TranslateProjectConfig): Promise<void> {
    this.logger.info('Scanning existing source files...');

    try {
      let filesProcessed = 0;

      // Process each source path
      for (const sourcePath of config.sourcePaths) {
        const fullSourcePath = path.join(this.workspacePath, sourcePath);
        const sourceUri = this.fileSystem.createUri(fullSourcePath);

        // Check if this is a file or directory
        const isFilePath = await this.isFile(sourceUri);

        if (isFilePath) {
          // It's a single file - process it directly if it's supported
          if (this.isSupportedFile(fullSourcePath)) {
            this.logger.info(`Processing single source file: ${fullSourcePath}`);

            try {
              await this.pipeline.processFile(
                sourceUri,
                this.workspacePath,
                config,
                this.configProvider
              );

              filesProcessed++;
              this.logger.info(`Successfully processed source file: ${fullSourcePath}`);
            } catch (error) {
              this.logger.error(`Error processing source file ${fullSourcePath}: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            this.logger.warn(`Skipping unsupported file: ${fullSourcePath}`);
          }
        } else {
          // It's a directory - find all files recursively
          try {
            // Find all files in the source path
            const files = await this.findAllFilesInDir(sourceUri);

            this.logger.info(`Found ${files.length} files in source path: ${sourcePath}`);

            // Process each file
            for (const fileUri of files) {
              try {
                // Check if file is supported for translation
                if (this.isSupportedFile(fileUri.fsPath)) {
                  await this.pipeline.processFile(
                    fileUri,
                    this.workspacePath,
                    config,
                    this.configProvider
                  );

                  filesProcessed++;
                }
              } catch (error) {
                this.logger.error(`Error processing existing file ${fileUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          } catch (error) {
            this.logger.error(`Error processing source directory ${fullSourcePath}: ${error instanceof Error ? error.message : String(error)}`);
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
   * Translate a single file
   * @param fileUri URI of the file to translate
   * @param config Project configuration
   * @param force Force translation even if target is up to date
   */
  async translateSingleFile(fileUri: IUri, config: TranslateProjectConfig, force: boolean = false): Promise<void> {
    this.logger.info(`Translating single file: ${fileUri.fsPath}`);

    // Check if file exists
    const exists = await this.fileSystem.fileExists(fileUri);
    if (!exists) {
      throw new Error(`File not found: ${fileUri.fsPath}`);
    }

    // Check if file is readable
    try {
      await this.fileSystem.readFile(fileUri);
    } catch {
      throw new Error(`Cannot read file (check permissions): ${fileUri.fsPath}`);
    }

    // Check if file type is supported
    if (!this.isSupportedFile(fileUri.fsPath)) {
      throw new Error(`Unsupported file type: ${fileUri.fsPath}. Supported types: .json, .md, .mdx, .yaml, .yml`);
    }

    // Process the file using the pipeline
    await this.pipeline.processFile(
      fileUri,
      this.workspacePath,
      config,
      this.configProvider,
      force
    );

    this.logger.info(`Successfully translated file: ${fileUri.fsPath}`);
  }

  /**
   * Close resources
   */
  dispose(): void {
    this.stopWatching();
    this.cache.close();
  }
}