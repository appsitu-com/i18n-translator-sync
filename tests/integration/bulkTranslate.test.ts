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

// Helper function to create a temp directory with test files
async function createTempTestDir() {
  const tempDir = path.join(os.tmpdir(), `i18n-translator-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  // Create source directory structure
  const sourceDir = path.join(tempDir, 'i18n', 'en');
  await fs.mkdir(sourceDir, { recursive: true });

  // Create nested directory for testing
  const nestedDir = path.join(sourceDir, 'nested');
  await fs.mkdir(nestedDir, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(sourceDir, 'messages.json'),
    JSON.stringify({
      greeting: 'Hello',
      farewell: 'Goodbye'
    }, null, 2)
  );

  await fs.writeFile(
    path.join(sourceDir, 'config.yaml'),
    'title: Configuration\ndescription: Test configuration file'
  );

  await fs.writeFile(
    path.join(nestedDir, 'nested.json'),
    JSON.stringify({
      nestedGreeting: 'Hello from nested',
      nestedFarewell: 'Goodbye from nested'
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

// Helper function to verify translated files
async function verifyTranslatedFiles(baseDir: string, sourceLocale: string, targetLocales: string[]) {
  // Check that all target files were created
  for (const targetLocale of targetLocales) {
    const targetDir = path.join(baseDir, 'i18n', targetLocale);

    // Check main JSON file
    const messagesPath = path.join(targetDir, 'messages.json');
    const messagesExists = await fs.access(messagesPath).then(() => true).catch(() => false);
    expect(messagesExists, `Missing target file: ${messagesPath}`).toBe(true);

    // Check YAML file
    const configPath = path.join(targetDir, 'config.yaml');
    const configExists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(configExists, `Missing target file: ${configPath}`).toBe(true);

    // Check nested JSON file
    const nestedPath = path.join(targetDir, 'nested', 'nested.json');
    const nestedExists = await fs.access(nestedPath).then(() => true).catch(() => false);
    expect(nestedExists, `Missing target file: ${nestedPath}`).toBe(true);

    // Verify content (with the copy engine, the content should match the source)
    const messagesContent = JSON.parse(await fs.readFile(messagesPath, 'utf8'));
    expect(messagesContent).toEqual({
      greeting: 'Hello',
      farewell: 'Goodbye'
    });

    const nestedContent = JSON.parse(await fs.readFile(nestedPath, 'utf8'));
    expect(nestedContent).toEqual({
      nestedGreeting: 'Hello from nested',
      nestedFarewell: 'Goodbye from nested'
    });
  }
}

describe('Bulk Translation Integration Tests', () => {
  let tempDir: string;
  let fileSystem: NodeFileSystem;
  let logger: ConsoleLogger;
  let cache: SQLiteCache;
  let configProvider: CliConfigProvider;
  let watcher: CliWorkspaceWatcher;
  let translatorManager: TranslatorManager;
  let config: TranslateProjectConfig;

  beforeEach(async () => {
    // Create temporary test directory with files
    tempDir = await createTempTestDir();

    // Initialize real components (not mocks)
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');
    cache = new SQLiteCache(':memory:'); // Use in-memory DB for tests
    watcher = new CliWorkspaceWatcher(fileSystem, logger, tempDir);
    configProvider = new CliConfigProvider(fileSystem, logger, path.join(tempDir, '.translate.json'));

    // Create translator manager with real components
    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      tempDir,
      watcher,
      configProvider
    );

    // Create test configuration
    config = {
      sourceDir: '',
      targetDir: '',
      sourcePaths: ['i18n/en'],
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
  });

  afterEach(async () => {
    // Clean up
    translatorManager.dispose();
    await cleanupTempDir(tempDir);
  });

  it('should bulk translate all files in source paths', async () => {
    // Track progress
    let progressUpdates: Array<{current: number, total: number, file: string}> = [];
    const progressCallback = (current: number, total: number, file: string) => {
      progressUpdates.push({ current, total, file });
    };

    // Execute bulk translate
    const count = await translatorManager.bulkTranslate(config, progressCallback, true);

    // Verify results
    expect(count).toBeGreaterThan(0);
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Last progress update should show completion
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.current).toBe(lastUpdate.total);

    // Verify that files were created correctly
    await verifyTranslatedFiles(tempDir, config.sourceLocale, config.targetLocales);

    // Verify logger calls
    expect(logger.info).toHaveBeenCalledWith('Starting bulk translation of all source files');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Bulk translation complete'));
  });

  it('should skip translation when files are up to date', async () => {
    // First do a bulk translation to create all files
    await translatorManager.bulkTranslate(config, undefined, true);

    // Reset logger calls
    vi.mocked(logger.info).mockClear();

    // Do another bulk translation without force flag
    const count = await translatorManager.bulkTranslate(config);

    // Verify that all files were processed but not translated (due to timestamp check)
    expect(count).toBeGreaterThan(0);
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Skipping up-to-date file/));
  });

  it('should force translation even when files are up to date', async () => {
    // First do a bulk translation to create all files
    await translatorManager.bulkTranslate(config, undefined, true);

    // Reset logger calls
    vi.mocked(logger.info).mockClear();

    // Do another bulk translation with force flag
    const count = await translatorManager.bulkTranslate(config, undefined, true);

    // Verify that files were translated (not skipped)
    expect(count).toBeGreaterThan(0);
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringMatching(/Skipping up-to-date file/));
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Translating:/));
  });
});