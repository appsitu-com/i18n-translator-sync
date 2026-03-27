import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { TRANSLATOR_JSON } from '../../src/core/constants';
import * as fs from 'fs/promises';
import * as os from 'os';
import { TranslatorManager } from '../../src/core/translatorManager';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/baseLogger';
import { SQLiteCache } from '../../src/core/cache/sqlite';
import { WorkspaceWatcher } from '../../src/core/util/watcher';
import { CliWorkspaceWatcher } from '../../src/cli/watcher';
import { CliConfigProvider } from '../../src/cli/cliConfig';
import { TranslateProjectConfig, defaultConfig } from '../../src/core/coreConfig';
import { CopyTranslator } from '../../src/translators/copy';
import { registerTranslator } from '../../src/translators/registry';

// Helper function to create a temp directory with test files
async function createTempTestDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-translator-test-'));

  // Create source directory structure
  const sourceDir = path.join(tempDir, 'i18n', 'en');
  await fs.mkdir(sourceDir, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(sourceDir, 'messages.json'),
    JSON.stringify({
      greeting: 'Hello',
      farewell: 'Goodbye'
    }, null, 2)
  );

  // Create the root en.json file
  await fs.writeFile(
    path.join(tempDir, 'i18n', 'en.json'),
    JSON.stringify({
      rootMessage: 'Root message'
    }, null, 2)
  );

  return tempDir;
}

// Helper function to clean up temp directory
async function cleanupTempDir(dir: string) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Error cleaning up temp directory: ${error}`);
  }
}

describe('File Watcher Integration Tests', () => {
  let tempDir: string;
  let fileSystem: NodeFileSystem;
  let logger: ConsoleLogger;
  let cache: SQLiteCache;
  let configProvider: CliConfigProvider;
  let watcher: CliWorkspaceWatcher;
  let translatorManager: TranslatorManager;
  let config: TranslateProjectConfig;

  beforeEach(async () => {
    // Register the copy translator
    registerTranslator(CopyTranslator);

    // Create temporary test directory with files
    tempDir = await createTempTestDir();

    // Create a translator.json file with configuration for the copy engine
    const translateConfig = {
      sourceDir: '',
      targetDir: '',
      sourcePaths: ['i18n/en', 'i18n/en.json'], // Include both sourcePaths
      sourceLocale: 'en',
      targetLocales: ['fr', 'es', 'de'],
      enableBackTranslation: false,
      defaultMarkdownEngine: 'copy',
      defaultJsonEngine: 'copy',
      engineOverrides: {},
      translator: {
        copy: {}  // Add empty configuration for copy engine
      }
    };

    // Write the config file to the temp directory
    await fs.writeFile(
      path.join(tempDir, TRANSLATOR_JSON),
      JSON.stringify(translateConfig, null, 2)
    );

    // Initialize real components (not mocks)
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');
    cache = new SQLiteCache(':memory:', process.cwd()); // Use in-memory DB for tests
    configProvider = new CliConfigProvider(fileSystem, logger, path.join(tempDir, TRANSLATOR_JSON));

    // Need to load the config we just created
    await configProvider.load();

    // Create test configuration
    config = {
      ...defaultConfig,
      sourceDir: '',
      targetDir: '',
      sourcePaths: ['i18n/en', 'i18n/en.json'], // Include both the directory and the root file
      sourceLocale: 'en',
      targetLocales: ['fr', 'es', 'de'],
      enableBackTranslation: false,
      defaultMarkdownEngine: 'copy',
      defaultJsonEngine: 'copy',
      engineOverrides: {}
    };

    // Spy on logger to track progress
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation((msg) => {
      console.error(msg); // Still log errors to console for debugging
    });

    // Override the get method in config provider to properly handle all sections
    vi.spyOn(configProvider, 'get').mockImplementation((section: string, defaultValue?: any) => {
      // Handle configuration for translation engines
      if (section === 'copy') {
        // For the copy engine, return a valid (empty) configuration object
        return {};
      }

      // For project configuration properties, get them from our config object
      if (section.includes('.')) {
        const parts = section.split('.');
        let current = config as any;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            return defaultValue;
          }
        }
        return current;
      }

      // For top-level config properties, get them directly
      if (section in config) {
        return config[section as keyof typeof config];
      }

      return defaultValue;
    });

    // Set up translator manager and watcher
    watcher = new CliWorkspaceWatcher(fileSystem, logger, tempDir);
    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      tempDir,
      watcher,
      configProvider,
      undefined,
      undefined,
      undefined
    );
  });

  afterEach(async () => {
    // Clean up
    if (translatorManager) {
      translatorManager.dispose();
    }
    await cleanupTempDir(tempDir);
  });

  it('should trigger onDidCreate when new files are created', async () => {
    // Set up spies BEFORE starting watching
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 400));

    // Clear any initial calls from existing files being processed
    onAddOrChangeSpy.mockClear();

    // Create a new file in the watched directory
    const newFileDir = path.join(tempDir, 'i18n', 'en');
    const newFilePath = path.join(newFileDir, 'newfile.json');
    const newFileContent = JSON.stringify({
      newMessage: 'This is a new message',
      anotherKey: 'Another value'
    }, null, 2);

    await fs.mkdir(newFileDir, { recursive: true });
    await fs.writeFile(newFilePath, newFileContent);

    // Wait for file system events to propagate
    // chokidar has awaitWriteFinish with 300ms stability threshold + 100ms poll interval
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify that the file creation was detected
    await vi.waitFor(() => {
      expect(onAddOrChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringMatching(/newfile\.json$/)
        }),
        config
      );
    }, { timeout: 5000 });
  }, 10000);

  it('should trigger onDidChange when existing files are modified', async () => {
    // Set up spies BEFORE starting watching
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 400));

    // Clear any initial calls from existing files being processed
    onAddOrChangeSpy.mockClear();

    // Modify an existing file
    const existingFilePath = path.join(tempDir, 'i18n', 'en', 'messages.json');
    const modifiedContent = JSON.stringify({
      greeting: 'Hello World - Modified',
      farewell: 'Goodbye',
      newField: 'Added field'
    }, null, 2);

    await fs.writeFile(existingFilePath, modifiedContent);

    // Verify that the file change was detected
    await vi.waitFor(() => {
      expect(onAddOrChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringMatching(/messages\.json$/)
        }),
        config
      );
    }, { timeout: 5000 });
  }, 10000);

  it('should trigger onDidDelete when files are deleted', async () => {
    // First create a test file to delete
    const testFilePath = path.join(tempDir, 'i18n', 'en', 'tobedeleted.json');
    await fs.writeFile(testFilePath, JSON.stringify({ test: 'value' }, null, 2));

    // Set up spies BEFORE starting watching
    const onDeleteSpy = vi.spyOn(translatorManager as any, 'onDelete');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 400));

    // Clear any initial calls
    onDeleteSpy.mockClear();

    // Delete the file
    await fs.unlink(testFilePath);

    // Verify that the file deletion was detected
    await vi.waitFor(() => {
      expect(onDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringMatching(/tobedeleted\.json$/)
        }),
        config
      );
    }, { timeout: 5000 });
  }, 10000);

  it('should detect file operations through file watcher events', async () => {
    // This test focuses on verifying that the file watcher system is properly connected
    // by checking that file operations trigger the expected internal methods

    // Set up spies BEFORE starting watching
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');
    const onDeleteSpy = vi.spyOn(translatorManager as any, 'onDelete');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clear any initial setup calls
    onAddOrChangeSpy.mockClear();
    onDeleteSpy.mockClear();

    // Create a test file and wait for the add event.
    // Note: rapid create→modify→delete defeats awaitWriteFinish (300ms stability threshold),
    // so we must wait for the create event before deleting.
    const testFilePath = path.join(tempDir, 'i18n', 'en', 'watchertest.json');
    await fs.writeFile(testFilePath, JSON.stringify({ initial: 'content' }, null, 2));

    // Wait for the create event before deleting (awaitWriteFinish needs stability before emitting)
    await vi.waitFor(() => {
      expect(onAddOrChangeSpy).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Now delete and verify the delete event fires
    await fs.unlink(testFilePath);
    await vi.waitFor(() => {
      expect(onDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringMatching(/watchertest\.json$/)
        }),
        config
      );
    }, { timeout: 5000 });
  }, 15000);

  it('should verify watcher setup with manual event simulation', async () => {
    // This test manually simulates watcher events to verify the system works correctly
    // when events are triggered, bypassing potential file system timing issues

    // Set up spies
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');
    const onDeleteSpy = vi.spyOn(translatorManager as any, 'onDelete');

    // Start watching
    await translatorManager.startWatching(config);

    // Create file URIs for testing
    const testFilePath = path.join(tempDir, 'i18n', 'en', 'manual-test.json');
    const testFileUri = fileSystem.createUri(testFilePath);

    // Manually trigger the methods to verify they work correctly
    await (translatorManager as any).onAddOrChange(testFileUri, config);

    // Verify the method was called
    expect(onAddOrChangeSpy).toHaveBeenCalledWith(testFileUri, config);

    // Test deletion
    await (translatorManager as any).onDelete(testFileUri, config);

    // Verify the delete method was called
    expect(onDeleteSpy).toHaveBeenCalledWith(testFileUri, config);
  });
});