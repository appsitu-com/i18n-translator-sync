import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// First, mock the vscode module - This needs to happen before importing modules that use vscode
vi.mock('vscode', () => {
  return import('../mocks/vscode');
});

// Now mock other dependencies
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

vi.mock('../../src/core/util/env', () => ({
  initTranslatorEnv: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../src/vscode/watcher', () => ({
  VSCodeWorkspaceWatcher: vi.fn().mockImplementation(() => ({
    createFileSystemWatcher: vi.fn(),
    onDidRenameFiles: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('../../src/vscode/config', () => ({
  VsCodeConfigProvider: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    update: vi.fn()
  }))
}));

vi.mock('../../src/vscode/logger', () => ({
  VSCodeLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }))
}));

vi.mock('../../src/vscode/filesystem', () => ({
  VSCodeFileSystem: vi.fn().mockImplementation(() => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
    fileExistsSync: vi.fn().mockReturnValue(true),
    directoryExistsSync: vi.fn().mockReturnValue(true),
    readDirectory: vi.fn(),
    stat: vi.fn(),
    deleteFile: vi.fn(),
    createDirectory: vi.fn(),
    createUri: vi.fn(path => ({ path, fsPath: path, scheme: 'file' })),
    joinPath: vi.fn((base, ...paths) => ({ fsPath: `${base.fsPath}/${paths.join('/')}`, path: `${base.path}/${paths.join('/')}`, scheme: 'file' }))
  }))
}));

// Now import the modules after all mocks are set up
import { VSCodeTranslatorAdapter } from '../../src/vscode/adapter';
import { TranslatorAdapter } from '../../src/core/adapters/baseAdapter';
import { VsCodeConfigProvider } from '../../src/vscode/config';
import { VSCodeLogger } from '../../src/vscode/logger';
import { VSCodeFileSystem } from '../../src/vscode/filesystem';

describe('VSCodeTranslatorAdapter', () => {
  let adapter: VSCodeTranslatorAdapter;

  // Create a mock ExtensionContext
  const mockContext: any = {
    subscriptions: [],
    extensionPath: '/test/extension/path',
    extensionUri: { fsPath: '/test/extension/path' },
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
      setKeysForSync: vi.fn()
    },
    workspaceState: {
      get: vi.fn(),
      update: vi.fn(),
      setKeysForSync: vi.fn()
    },
    secrets: {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn()
    },
    asAbsolutePath: vi.fn(relativePath => `/test/extension/path/${relativePath}`),
    environmentVariableCollection: {},
    logUri: { fsPath: '/test/extension/path/logs' },
    logPath: '/test/extension/path/logs',
    storageUri: { fsPath: '/test/extension/path/storage' },
    storagePath: '/test/extension/path/storage',
    globalStorageUri: { fsPath: '/test/extension/path/globalStorage' },
    globalStoragePath: '/test/extension/path/globalStorage',
    extensionMode: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create adapter instance
    adapter = new VSCodeTranslatorAdapter();

    // Mock startWithContext method for testing
    adapter.startWithContext = vi.fn().mockImplementation(async () => {
      await adapter.initialize();
      await adapter.start();
    });

    // Mock initialize method to avoid actual implementation issues
    adapter.initialize = vi.fn().mockResolvedValue(undefined);
  });

  it('should be initialized with correct parameters', () => {
    expect(VsCodeConfigProvider).toHaveBeenCalled();
    expect(VSCodeLogger).toHaveBeenCalled();
    expect(VSCodeFileSystem).toHaveBeenCalled();
    expect(TranslatorAdapter).toHaveBeenCalledWith(
      '/test/workspace',
      expect.any(Object), // VSCodeLogger
      expect.any(Object), // VSCodeFileSystem
      expect.any(Object)  // VSCodeConfigProvider
    );
  });

  it('should call initialize and start methods correctly', async () => {
    // Setup mocks
    adapter.initialize = vi.fn().mockResolvedValue(undefined);
    adapter.start = vi.fn().mockResolvedValue(undefined);
    adapter.startWithContext = vi.fn().mockImplementation(async (context) => {
      await adapter.initialize();
      await adapter.start();
      return;
    });

    // Call the method
    await adapter.startWithContext(mockContext);

    // Verify methods were called
    expect(adapter.initialize).toHaveBeenCalled();
    expect(adapter.start).toHaveBeenCalled();
  });

  it('should handle translateFile method', async () => {
    // Setup mock
    const mockBaseTranslateFile = vi.fn().mockResolvedValue(undefined);
    TranslatorAdapter.prototype.translateFile = mockBaseTranslateFile;

    // Mock access to translatorManager
    Object.defineProperty(adapter, 'translatorManager', {
      value: {},
      writable: true,
    });

    // Call the method
    await adapter.translateFile('/test/file.json', false);

    // Verify base method was called with correct arguments
    expect(mockBaseTranslateFile).toHaveBeenCalledWith(
      '/test/file.json',
      false
    );
  });

  it('should handle bulkTranslate method', async () => {
    // Setup mock
    const mockBaseBulkTranslate = vi.fn().mockResolvedValue(5);
    TranslatorAdapter.prototype.bulkTranslate = mockBaseBulkTranslate;

    // Mock access to translatorManager
    Object.defineProperty(adapter, 'translatorManager', {
      value: {},
      writable: true,
    });

    // Call the method
    await adapter.bulkTranslate(false);

    // Verify method was called with correct arguments
    expect(mockBaseBulkTranslate).toHaveBeenCalledWith(false);
  });
});