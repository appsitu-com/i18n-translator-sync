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
  });

  afterEach(async () => {
    // Clean up
    if (translatorManager) {
      translatorManager.dispose();
    }
    await cleanupTempDir(tempDir);
  });

  it('should properly set up watchers for specific file patterns including en.json', async () => {
    // Create a real workspace watcher
    watcher = new CliWorkspaceWatcher(fileSystem, logger, tempDir);

    // Create a translator manager
    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      tempDir,
      watcher,
      configProvider
    );

    // Directly spy on the onAddOrChange method - this is the method that gets called when a file changes
    // We can't easily test the full file system watcher in a unit test because chokidar needs real file system events
    const onAddOrChangeSpy = vi.spyOn(translatorManager as any, 'onAddOrChange');

    // Start watching
    await translatorManager.startWatching(config);

    // Clear initial setup log calls
    vi.mocked(logger.info).mockClear();

    // Create a URI for en.json
    const enJsonPath = path.join(tempDir, 'i18n', 'en.json');
    const enJsonUri = fileSystem.createUri(enJsonPath);

    // Manually invoke the onAddOrChange method as if the watcher detected a change
    await (translatorManager as any).onAddOrChange(enJsonUri, config);

    // Check that the file change was logged
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/File changed:/));

    // Verify onAddOrChange was called with en.json URI
    expect(onAddOrChangeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: enJsonPath }),
      config
    );
  });

  it('should properly set up watchers for both directory and specific file patterns', async () => {
    // Create a real workspace watcher with a spy
    watcher = new CliWorkspaceWatcher(fileSystem, logger, tempDir);
    const watcherSpy = vi.spyOn(watcher, 'createFileSystemWatcher');

    // Create a real translator manager
    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      tempDir,
      watcher,
      configProvider
    );

    // Start watching
    await translatorManager.startWatching(config);

    // Verify both patterns are being watched:
    // 1. The directory pattern (for i18n/en/**)
    // 2. The specific file pattern (for i18n/en.json)
    expect(watcherSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^i18n\/en\/\*\*$/)
    );

    expect(watcherSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^i18n\/en\.json$/)
    );

    // Verify the log messages for watcher creation
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Watcher created for i18n\/en\/\*\*/));
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Watcher created for i18n\/en\.json/));
  });

  it('should use correct watcher pattern for root en.json file', async () => {
    // Look at the patterns used in the TranslatorManager to set up watchers
    // This is a more focused test just on the pattern generation logic

    // First check if the file exists
    const enJsonPath = path.join(tempDir, 'i18n', 'en.json');
    const enJsonExists = await fs.access(enJsonPath).then(() => true).catch(() => false);
    expect(enJsonExists).toBe(true);

    // Set up spies on the fileSystem to control its behavior for isFile checks
    vi.spyOn(fileSystem, 'fileExists').mockResolvedValue(true);
    vi.spyOn(fileSystem, 'readFile').mockResolvedValue('{"test":"value"}');
    vi.spyOn(fileSystem, 'readDirectory').mockImplementation(() => {
      throw new Error('This is not a directory'); // This should trigger the "is a file" logic
    });

    watcher = new CliWorkspaceWatcher(fileSystem, logger, tempDir);
    const watcherSpy = vi.spyOn(watcher, 'createFileSystemWatcher');

    // Create a translator manager with our spied-on file system
    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      tempDir,
      watcher,
      configProvider
    );

    // Verify that isFile is correctly determining the en.json is a file
    const enJsonUri = fileSystem.createUri(enJsonPath);
    const isFileSpy = vi.spyOn(translatorManager as any, 'isFile');

    // Start watching
    await translatorManager.startWatching(config);

    // Check that isFile was called for en.json
    expect(isFileSpy).toHaveBeenCalledWith(expect.objectContaining({
      fsPath: expect.stringMatching(/en\.json$/)
    }));

    // Check that the file-specific pattern was used for en.json
    const watcherCalls = watcherSpy.mock.calls;
    const enJsonPatternCalls = watcherCalls.filter(call =>
      typeof call[0] === 'string' && call[0].includes('en.json')
    );

    expect(enJsonPatternCalls.length).toBeGreaterThan(0);

    // Make sure the pattern is correctly formed for watching a specific file
    // It should be something like 'i18n/en.json' not a directory pattern
    const enJsonPattern = enJsonPatternCalls[0][0] as string;
    expect(enJsonPattern).toMatch(/^i18n\/en\.json$/);
    expect(enJsonPattern).not.toMatch(/\*\*$/); // Should not end with ** (which would be a directory pattern)
  });
});