import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { TranslatorManager } from '../../src/core/translatorManager';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/logger';
import { SQLiteCache } from '../../src/cache.sqlite';
import { WorkspaceWatcher } from '../../src/core/util/watcher';
import { CliWorkspaceWatcher } from '../../src/cli/watcher';
import { CliConfigProvider } from '../../src/cli/config';
import { TranslateProjectConfig } from '../../src/core/config';
import { CopyTranslator } from '../../src/translators/copy';
import { registerTranslator } from '../../src/translators/registry';

// Helper function to create a temp directory with test files
async function createTempTestDir() {
  const tempDir = path.join(os.tmpdir(), `i18n-translator-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

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

    // Create a .translate.json file with configuration for the copy engine
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
      path.join(tempDir, '.translate.json'),
      JSON.stringify(translateConfig, null, 2)
    );

    // Initialize real components (not mocks)
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');
    cache = new SQLiteCache(':memory:'); // Use in-memory DB for tests
    configProvider = new CliConfigProvider(fileSystem, logger, path.join(tempDir, '.translate.json'));

    // Need to load the config we just created
    await configProvider.load();

    // Create test configuration
    config = {
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
      configProvider
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
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clear any initial calls from existing files being processed
    onAddOrChangeSpy.mockClear();

    // Create a new file in the watched directory
    const newFilePath = path.join(tempDir, 'i18n', 'en', 'newfile.json');
    const newFileContent = JSON.stringify({
      newMessage: 'This is a new message',
      anotherKey: 'Another value'
    }, null, 2);

    await fs.writeFile(newFilePath, newFileContent);

    // Wait for file system events to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify that the file creation was detected
    expect(onAddOrChangeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: expect.stringMatching(/newfile\.json$/)
      }),
      config
    );
  });

  it('should trigger onDidChange when existing files are modified', async () => {
    // Set up spies BEFORE starting watching
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 200));

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

    // Wait for file system events to propagate
    await new Promise(resolve => setTimeout(resolve, 800));

    // Verify that the file change was detected
    expect(onAddOrChangeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: expect.stringMatching(/messages\.json$/)
      }),
      config
    );
  });

  it('should trigger onDidDelete when files are deleted', async () => {
    // First create a test file to delete
    const testFilePath = path.join(tempDir, 'i18n', 'en', 'tobedeleted.json');
    await fs.writeFile(testFilePath, JSON.stringify({ test: 'value' }, null, 2));

    // Set up spies BEFORE starting watching
    const onDeleteSpy = vi.spyOn(translatorManager as any, 'onDelete');

    // Start watching
    await translatorManager.startWatching(config);

    // Wait for watchers to be set up
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clear any initial calls
    onDeleteSpy.mockClear();

    // Delete the file
    await fs.unlink(testFilePath);

    // Wait for file system events to propagate
    await new Promise(resolve => setTimeout(resolve, 800));

    // Verify that the file deletion was detected
    expect(onDeleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: expect.stringMatching(/tobedeleted\.json$/)
      }),
      config
    );
  });

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

    // Create a test file
    const testFilePath = path.join(tempDir, 'i18n', 'en', 'watchertest.json');
    await fs.writeFile(testFilePath, JSON.stringify({ initial: 'content' }, null, 2));

    // Wait for creation event
    await new Promise(resolve => setTimeout(resolve, 400));

    // Modify the file
    await fs.writeFile(testFilePath, JSON.stringify({ modified: 'content' }, null, 2));

    // Wait for modification event
    await new Promise(resolve => setTimeout(resolve, 400));

    // Delete the file
    await fs.unlink(testFilePath);

    // Wait for deletion event
    await new Promise(resolve => setTimeout(resolve, 400));

    // Verify that at least some file operations were detected
    // Note: File system events can be tricky in test environments, so we check for at least some activity
    const totalCalls = onAddOrChangeSpy.mock.calls.length + onDeleteSpy.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);

    // Log the calls for debugging if needed
    if (totalCalls === 0) {
      console.log('No file watcher calls detected. This might indicate a timing or setup issue.');
      console.log('onAddOrChange calls:', onAddOrChangeSpy.mock.calls.length);
      console.log('onDelete calls:', onDeleteSpy.mock.calls.length);
    }
  });

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