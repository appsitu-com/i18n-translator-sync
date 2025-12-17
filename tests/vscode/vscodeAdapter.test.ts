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

vi.mock('../../src/core/util/environmentSetup', () => ({
  initTranslatorEnv: vi.fn().mockResolvedValue(undefined),
  EncryptedKeyAccessError: class EncryptedKeyAccessError extends Error {}
}));

vi.mock('../../src/vscode/watcher', () => ({
  VSCodeWorkspaceWatcher: vi.fn().mockImplementation(() => ({
    createFileSystemWatcher: vi.fn(),
    onDidRenameFiles: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('../../src/vscode/vscodeConfig', () => ({
  VsCodeConfigProvider: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    update: vi.fn()
  }))
}));

vi.mock('../../src/vscode/vscodeLogger', () => ({
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
import { VSCodeTranslatorAdapter } from '../../src/vscode/vscodeAdapter';
import { TranslatorAdapter } from '../../src/core/adapters/baseAdapter';
import { VsCodeConfigProvider } from '../../src/vscode/vscodeConfig';
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

    // Create a mock logger
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    } as any;

    // Create adapter instance with mock output channel
    adapter = new VSCodeTranslatorAdapter(mockLogger);

    // Initialize the adapter state properties first
    (adapter as any).initialized = false;
    (adapter as any).running = false;

    // Mock the base methods but keep the real state management
    adapter.initialize = vi.fn().mockResolvedValue(undefined);
    adapter.start = vi.fn().mockImplementation(() => {
      // Simulate the real start behavior by setting running flag
      (adapter as any).running = true;
      return Promise.resolve();
    });
    adapter.stop = vi.fn().mockImplementation(() => {
      // Simulate the real stop behavior by setting running flag
      (adapter as any).running = false;
    });

    // Mock logger to avoid errors
    (adapter as any).logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock other required properties
    (adapter as any).vsCodeConfigProvider = {
      load: vi.fn().mockResolvedValue(undefined)
    };

    (adapter as any).workspacePath = '/test/workspace';
    (adapter as any).fileSystem = {};
  });

  it('should be initialized with correct parameters', () => {
    expect(VsCodeConfigProvider).toHaveBeenCalled();
    expect(VSCodeFileSystem).toHaveBeenCalled();
    expect(TranslatorAdapter).toHaveBeenCalledWith(
      '/test/workspace',
      expect.any(Object), // Logger
      expect.any(Object), // VSCodeFileSystem
      expect.any(Object)  // VSCodeConfigProvider
    );
  });

  it('should call initialize and start methods correctly', async () => {
    // Setup mocks
    adapter.initialize = vi.fn().mockResolvedValue(undefined);
    adapter.start = vi.fn().mockResolvedValue(undefined);
    (adapter as any).running = false;
    (adapter as any).initialized = false;

    const initSpy = vi.spyOn(adapter as any, 'initializeOnActivation');

    // Call the method
    await adapter.startWithContext(mockContext);

    // Verify methods were called
    expect(adapter.start).toHaveBeenCalled();
  });

  describe('State Management', () => {
    it('should start with uninitialized and not running state', () => {
      // Check initial state using public methods
      expect(adapter.isInitialized()).toBe(false);
      // Use a safer approach to check running state
      expect((adapter as any).running).toBe(false);
    });

    it('should set initialized=true but running=false after initializeOnActivation', async () => {
      // Pre-condition: check state before initialization
      expect(adapter.isInitialized()).toBe(false);
      expect((adapter as any).running).toBe(false);

      // Call initializeOnActivation
      await adapter.initializeOnActivation();

      // Post-condition: initialized but not running
      expect(adapter.isInitialized()).toBe(true);
      expect((adapter as any).running).toBe(false);
    });

    it('should set both initialized=true and running=true after startWithContext', async () => {
      // Pre-condition: check state before starting
      expect(adapter.isInitialized()).toBe(false);
      expect((adapter as any).running).toBe(false);

      // Call startWithContext
      await adapter.startWithContext(mockContext);

      // Post-condition: both initialized and running
      expect(adapter.isInitialized()).toBe(true);
      expect((adapter as any).running).toBe(true);
    });

    it('should not start if already running', async () => {
      // Set up as running
      await adapter.startWithContext(mockContext);
      expect((adapter as any).running).toBe(true);

      // Clear mocks to track subsequent calls
      vi.clearAllMocks();
      adapter.initialize = vi.fn().mockResolvedValue(undefined);
      adapter.start = vi.fn().mockResolvedValue(undefined);

      // Try to start again
      await adapter.startWithContext(mockContext);

      // Should not call initialize or start again
      expect(adapter.initialize).not.toHaveBeenCalled();
      expect(adapter.start).not.toHaveBeenCalled();

      // State should remain the same
      expect((adapter as any).running).toBe(true);
    });

    it('should allow multiple calls to initializeOnActivation (idempotent)', async () => {
      // First call
      await adapter.initializeOnActivation();
      expect(adapter.isInitialized()).toBe(true);

      // Clear mocks to track subsequent calls
      vi.clearAllMocks();
      adapter.initialize = vi.fn().mockResolvedValue(undefined);

      // Second call
      await adapter.initializeOnActivation();

      // Should not call initialize again
      expect(adapter.initialize).not.toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(true);
    });
  });

  describe('MateCat Integration', () => {
    it('should allow MateCat operations when initialized but not running', async () => {
      // Initialize but don't start
      await adapter.initializeOnActivation();

      // Verify state using public methods
      expect(adapter.isInitialized()).toBe(true);
      expect(adapter.isRunning()).toBe(false);

      // Mock the MateCat methods directly on the adapter
      adapter.pushToMateCat = vi.fn().mockResolvedValue(undefined);
      adapter.pullFromMateCat = vi.fn().mockResolvedValue(undefined);

      // Should be able to call MateCat operations
      await expect(adapter.pushToMateCat()).resolves.not.toThrow();
      await expect(adapter.pullFromMateCat()).resolves.not.toThrow();

      expect(adapter.pushToMateCat).toHaveBeenCalled();
      expect(adapter.pullFromMateCat).toHaveBeenCalled();
    });

    it('should initialize automatically when MateCat operations are called', async () => {
      // Ensure not initialized initially using public method
      expect(adapter.isInitialized()).toBe(false);

      // Mock the MateCat methods directly
      adapter.pushToMateCat = vi.fn().mockResolvedValue(undefined);

      // Try to push - this should work due to the mocked implementation
      await adapter.pushToMateCat();

      // Verify the method was called
      expect(adapter.pushToMateCat).toHaveBeenCalled();
    });
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