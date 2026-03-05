import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLITranslatorAdapter } from '../../src/cli/cliAdapter';
import { CliWorkspaceWatcher } from '../../src/cli/watcher';
import { CliConfigProvider } from '../../src/cli/cliConfig';
import { NodeFileSystem } from '../../src/core/util/fs';
import { ConsoleLogger } from '../../src/core/util/baseLogger';
import { TranslatorAdapter } from '../../src/core/adapters/baseAdapter';
import * as env from '../../src/core/util/environmentSetup';
import * as path from 'path';
import { TRANSLATOR_JSON } from '../../src/core/constants';
import { tmpdir } from 'os';
import * as fs from 'fs';

// Mock dependencies
vi.mock('../../src/cli/watcher', () => ({
  CliWorkspaceWatcher: vi.fn().mockImplementation(() => ({
    createFileSystemWatcher: vi.fn(),
    onDidRenameFiles: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('../../src/cli/cliConfig', () => ({
  CliConfigProvider: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    update: vi.fn()
  }))
}));

vi.mock('../../src/core/util/environmentSetup', () => ({
  initTranslatorEnv: vi.fn().mockResolvedValue(undefined)
}));

// Mock with a functioning directoryExistsSync method
vi.mock('../../src/core/util/fs', () => {
  const NodeFileSystem = vi.fn().mockImplementation(() => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    fileExists: vi.fn().mockResolvedValue(true),
    fileExistsSync: vi.fn().mockReturnValue(true),
    directoryExistsSync: vi.fn().mockReturnValue(true),
    readDirectory: vi.fn(),
    createDirectory: vi.fn(),
    createUri: vi.fn(path => ({ fsPath: path, path, scheme: 'file' })),
    joinPath: vi.fn((base, ...paths) => ({
      fsPath: `${base.fsPath}/${paths.join('/')}`,
      path: `${base.path}/${paths.join('/')}`,
      scheme: 'file'
    })),
    stat: vi.fn()
  }));
  return {
    NodeFileSystem,
    nodeFileSystem: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn().mockResolvedValue(true),
      fileExistsSync: vi.fn().mockReturnValue(true),
      directoryExistsSync: vi.fn().mockReturnValue(true),
      readDirectory: vi.fn(),
      createDirectory: vi.fn(),
      createUri: vi.fn(path => ({ fsPath: path, path, scheme: 'file' })),
      joinPath: vi.fn((base, ...paths) => ({
        fsPath: `${base.fsPath}/${paths.join('/')}`,
        path: `${base.path}/${paths.join('/')}`,
        scheme: 'file'
      })),
      stat: vi.fn()
    }
  };
});

vi.mock('../../src/core/adapters/baseAdapter', () => ({
  TranslatorAdapter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    restart: vi.fn().mockResolvedValue(undefined),
    translateFile: vi.fn().mockResolvedValue(undefined),
    bulkTranslate: vi.fn().mockResolvedValue(5),
    pushToMateCat: vi.fn().mockResolvedValue(undefined),
    pullFromMateCat: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn()
  }))
}));

function makeTmpDir(prefix = 'i18n-adapter-test-') {
  return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

describe('CLITranslatorAdapter', () => {
  let adapter: CLITranslatorAdapter;
  let originalProcessArgv: string[];
  let testDir: string;
  let testWorkspacePath: string;
  let testConfigPath: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a temporary test directory
    testDir = makeTmpDir();
    testWorkspacePath = testDir;
    testConfigPath = path.join(testDir, TRANSLATOR_JSON);

    // Create cache directory
    const cacheDir = path.join(testDir, '.translator');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Create necessary directory structure
    fs.writeFileSync(testConfigPath, JSON.stringify({
      translator: {
        sourceLocale: 'en',
        targetLocales: ['fr', 'es']
      }
    }));

    // Save original process.argv
    originalProcessArgv = process.argv;

    // Create adapter instance
    adapter = new CLITranslatorAdapter(testWorkspacePath, testConfigPath);
  });

  afterEach(() => {
    // Restore process.argv
    process.argv = originalProcessArgv;

    // Clean up
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('should be initialized with correct parameters', () => {
    expect(CliConfigProvider).toHaveBeenCalled();
    expect(TranslatorAdapter).toHaveBeenCalledWith(
      testWorkspacePath,
      expect.any(ConsoleLogger),
      expect.any(NodeFileSystem),
      expect.any(Object) // ConfigProvider
    );
  });

  it('should override initialize method', async () => {
    // Mock the logger and methods
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    };

    // Replace the logger with our mock
    Object.defineProperty(adapter, 'logger', {
      value: mockLogger,
      writable: true
    });

    // Mock the configProvider and cliConfigProvider
    const mockConfigProvider = {
      load: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      update: vi.fn()
    };

    Object.defineProperty(adapter, 'configProvider', {
      value: mockConfigProvider,
      writable: true
    });

    Object.defineProperty(adapter, 'cliConfigProvider', {
      value: mockConfigProvider,
      writable: true
    });

    // Mock the filesystem
    const mockFileSystem = new NodeFileSystem();

    Object.defineProperty(adapter, 'fileSystem', {
      value: mockFileSystem,
      writable: true
    });

    // Mock the workspacePath
    Object.defineProperty(adapter, 'workspacePath', {
      value: testWorkspacePath,
      writable: true
    });

    // Mock the super.initialize method to avoid actual implementation
    const mockInitialize = vi.fn().mockResolvedValue(undefined);
    TranslatorAdapter.prototype.initialize = mockInitialize;

    await adapter.initialize();

    // Check that CLI configuration was loaded
    expect(mockConfigProvider.load).toHaveBeenCalled();

    // No longer checking for initTranslatorEnv being called directly from CLI adapter
    // since that functionality has moved to the base adapter class

    // Check that base initialize was called
    expect(mockInitialize).toHaveBeenCalled();
  });

  describe('translateFile', () => {
    it('should pass force flag from process.argv', async () => {
      // Set force flag
      process.argv = [...originalProcessArgv, '--force'];

      // Mock the base translateFile method
      const mockTranslateFile = vi.fn().mockResolvedValue(undefined);
      TranslatorAdapter.prototype.translateFile = mockTranslateFile;

      await adapter.translateFile('test.json');

      // Check force flag was passed to base method
      expect(mockTranslateFile).toHaveBeenCalledWith(
        'test.json',
        true // force flag
      );
    });

    it('should pass false for force flag when not in process.argv', async () => {
      // Ensure no force flag
      process.argv = originalProcessArgv.filter(arg => arg !== '--force');

      // Mock the base translateFile method
      const mockTranslateFile = vi.fn().mockResolvedValue(undefined);
      TranslatorAdapter.prototype.translateFile = mockTranslateFile;

      await adapter.translateFile('test.json');

      // Check force flag was passed to base method
      expect(mockTranslateFile).toHaveBeenCalledWith(
        'test.json',
        false // force flag
      );
    });
  });
});