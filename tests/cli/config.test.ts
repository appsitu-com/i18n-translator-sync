import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { CliConfigProvider } from '../../src/cli/config';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/logger';

function makeTmpDir(prefix = 'i18n-config-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe('CliConfigProvider', () => {
  let testDir: string;
  let configPath: string;
  let configProvider: CliConfigProvider;
  let fileSystem: NodeFileSystem;
  let logger: ConsoleLogger;

  beforeEach(() => {
    testDir = makeTmpDir();
    configPath = path.join(testDir, 'config.json');
    fileSystem = new NodeFileSystem();
    logger = new ConsoleLogger('test');

    // Spy on logger methods
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    configProvider = new CliConfigProvider(fileSystem, logger, configPath);
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  describe('Loading configuration', () => {
    it('should load configuration from a file', async () => {
      const config = {
        translator: {
          sourceLocale: 'en',
          targetLocales: ['fr', 'es'],
          defaultMarkdownEngine: 'azure'
        }
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      await configProvider.load();

      expect(configProvider.get('translator.sourceLocale')).toBe('en');
      expect(configProvider.get('translator.targetLocales')).toEqual(['fr', 'es']);
      expect(configProvider.get('translator.defaultMarkdownEngine')).toBe('azure');
    });

    it('should handle missing configuration file gracefully', async () => {
      // File does not exist
      await configProvider.load();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Configuration file not found'));
      expect(configProvider.get('nonexistent.key', 'default')).toBe('default');
    });

    it('should handle invalid JSON gracefully', async () => {
      writeFileSync(configPath, 'invalid { json');

      await configProvider.load();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error loading configuration'));
      expect(configProvider.get('some.key', 'default')).toBe('default');
    });
  });

  describe('Getting configuration values', () => {
    it('should return default value for non-existent keys', async () => {
      const config = { translator: { sourceLocale: 'en' } };
      writeFileSync(configPath, JSON.stringify(config));

      await configProvider.load();

      expect(configProvider.get('translator.nonExistentKey', 'default')).toBe('default');
    });

    it('should navigate nested objects', async () => {
      const config = {
        translator: {
          nested: {
            deepKey: 'deepValue'
          }
        }
      };
      writeFileSync(configPath, JSON.stringify(config));

      await configProvider.load();

      expect(configProvider.get('translator.nested.deepKey')).toBe('deepValue');
    });
  });

  describe('Updating configuration values', () => {
    it('should update configuration and persist to file', async () => {
      // Start with empty config
      await configProvider.load();

      // Update a value
      await configProvider.update('translator.newKey', 'newValue');

      // Check that the value is updated in memory
      expect(configProvider.get('translator.newKey')).toBe('newValue');

      // Check that the file was created with the correct content
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const parsedContent = JSON.parse(fileContent);
      expect(parsedContent.translator.newKey).toBe('newValue');
    });

    it('should update nested configuration', async () => {
      // Start with empty config
      await configProvider.load();

      // Update nested values
      await configProvider.update('deep.nested.value', 'nestedValue');

      // Check the value
      expect(configProvider.get('deep.nested.value')).toBe('nestedValue');

      // Update an existing nested value
      await configProvider.update('deep.nested.value', 'updatedValue');

      // Check the updated value
      expect(configProvider.get('deep.nested.value')).toBe('updatedValue');
    });
  });
});