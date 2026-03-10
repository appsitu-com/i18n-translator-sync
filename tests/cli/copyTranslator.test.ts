import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { TRANSLATOR_JSON } from '../../src/core/constants';
import * as os from 'os';
import * as fs from 'fs/promises';
import { CliConfigProvider } from '../../src/cli/cliConfig';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/baseLogger';
import { CopyTranslator } from '../../src/translators/copy';
import { registerTranslator, deregisterTranslator } from '../../src/translators/registry';
import { TranslatorPipeline } from '../../src/core/pipeline';
import { SQLiteCache } from '../../src/core/cache/sqlite';

// Helper function to create temp config file
async function createTempConfigFile(translator?: { copy: any }) {
  const tempDir = path.join(os.tmpdir(), `i18n-translator-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const config: Record<string, any> = {
    sourcePaths: ["i18n/en"],
    sourceLocale: "en",
    targetLocales: ["en-US", "es"],
    defaultMarkdownEngine: "copy",
    defaultJsonEngine: "copy",
    engineOverrides: {
      "copy": ["en-US"]
    }
  };

  // Add translator configuration if provided
  if (translator) {
    config.translator = translator;
  }

  const configPath = path.join(tempDir, TRANSLATOR_JSON);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  return { tempDir, configPath };
}

describe('CLI Copy Translator Tests', () => {
  let fileSystem: NodeFileSystem;
  let logger: ConsoleLogger;
  let tempDir: string;
  let configPath: string;
  let configProvider: CliConfigProvider;
  let cache: SQLiteCache;
  let pipeline: TranslatorPipeline;

  beforeEach(async () => {
    // Setup test environment
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');
    cache = new SQLiteCache(':memory:', process.cwd());

    // Clear the registry before each test
    try {
      deregisterTranslator('copy');
    } catch (e) {
      // Ignore if not registered
    }

    // Create a temp config file with minimal configuration
    const config = await createTempConfigFile();
    tempDir = config.tempDir;
    configPath = config.configPath;

    configProvider = new CliConfigProvider(fileSystem, logger, configPath);
    await configProvider.load();

    pipeline = new TranslatorPipeline(fileSystem, logger, cache, tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    // Clean up
    try {
      deregisterTranslator('copy');
    } catch (e) {
      // Ignore if not registered
    }
  });

  it('should return undefined for engine key without special handling', async () => {
    // Test with the configProvider from a clean setup (empty translator section)
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    // Create a clean config with no translator section
    const config = await createTempConfigFile();
    tempDir = config.tempDir;
    configPath = config.configPath;

    // Create a new config provider with the clean config
    const cleanConfigProvider = new CliConfigProvider(fileSystem, logger, configPath);
    await cleanConfigProvider.load();

    // Engine config is no longer resolved through configProvider.get()
    // The new config system uses loadTranslatorConfig() instead
    const result = cleanConfigProvider.get<Record<string, unknown>>('copy');

    // Without special engine handling, 'copy' is just a dot-path lookup
    // which returns undefined since there's no top-level 'copy' key
    expect(result).toBeUndefined();
  });

  it('should register copy translator when initializing the CLI adapter', async () => {
    // Create CLI adapter for testing
    const { CLITranslatorAdapter } = await import('../../src/cli/cliAdapter');

    // Mock the fileSystem.writeFile method to prevent actually writing files
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async () => {});

    // Create adapter instance
    const adapter = new CLITranslatorAdapter(tempDir, configPath);

    // Initialize it (which should register all translators including copy)
    await adapter.initialize();

    // Get the copy translator from the registry to verify it was registered
    const { getTranslator } = await import('../../src/translators/registry');
    let copyTranslatorRegistered = true;

    try {
      const copyTranslator = getTranslator('copy');
      expect(copyTranslator).toBeDefined();
      expect(copyTranslator.name).toBe('copy');
    } catch (e) {
      copyTranslatorRegistered = false;
    }

    // The copy translator should be registered after adapter initialization
    expect(copyTranslatorRegistered).toBe(true);
  });

  it('should work with copy translator registered and no engine config required', async () => {
    // Register the copy translator
    registerTranslator(CopyTranslator);

    // Engine config for copy is no longer resolved through configProvider.get()
    // The copy translator doesn't need any API config - the executor handles it directly
    const copyTranslator = CopyTranslator;
    expect(copyTranslator.name).toBe('copy');

    // Verify copy translator returns input unchanged
    const result = await copyTranslator.translateMany(['hello'], [null], {
      source: 'en',
      target: 'fr',
      apiConfig: {} as any
    });
    expect(result).toEqual(['hello']);
  });

  it('should resolve translator.copy section via dot-path navigation', async () => {
    // Create a config with translator.copy section
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    const config = await createTempConfigFile({ copy: {} });
    tempDir = config.tempDir;
    configPath = config.configPath;

    configProvider = new CliConfigProvider(fileSystem, logger, configPath);
    await configProvider.load();

    // With the new config system, engine configs are under 'translator.copy'
    const engineConfig = configProvider.get('translator.copy');
    expect(engineConfig).toBeDefined();
  });
});