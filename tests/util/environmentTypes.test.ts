import { it, expect, describe, beforeEach, vi } from 'vitest';
import { resolveEnvString, resolveEnvDeep, MissingEnvVarError, getEnv, initTranslatorEnv, resetEnvInitialization } from '../../src/core/util/environmentSetup';
import { createMockFileSystem } from '../mocks/filesystem';
import { TRANSLATOR_ENV } from '../../src/core/constants';

// Mock logger for tests
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn()
};

describe('MissingEnvVarError', () => {
  it('creates MissingEnvVarError with correct message', () => {
    const err = new MissingEnvVarError('MY_VAR');
    expect(err).toBeInstanceOf(MissingEnvVarError);
    expect(err.message).toMatch(/MY_VAR/);
  });
});

describe('getEnv', () => {
  beforeEach(() => {
    // Clear any existing env vars and warnings
    vi.clearAllMocks();
  });

  it('returns environment variable value when set', () => {
    process.env.TEST_VAR = 'test-value';
    expect(getEnv('TEST_VAR', mockLogger)).toBe('test-value');
  });

  it('throws MissingEnvVarError when environment variable is not set', () => {
    delete process.env.NONEXISTENT_VAR;
    expect(() => getEnv('NONEXISTENT_VAR', mockLogger)).toThrow(MissingEnvVarError);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe('resolveEnvString', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns value directly if not string', () => {
    expect(resolveEnvString(123, mockLogger)).toBe(123);
  });

  it('resolves env:VAR_NAME', () => {
    process.env.TEST_ENV = 'abc';
    expect(resolveEnvString('env:TEST_ENV', mockLogger)).toBe('abc');
  });

  it('throws MissingEnvVarError when unset', () => {
    delete process.env.NO_VAR;
    expect(() => resolveEnvString('env:NO_VAR', mockLogger)).toThrow(MissingEnvVarError);
  });

  it('resolves ${VAR} in strings', () => {
    process.env.MYVAR = 'zzz';
    const res = resolveEnvString('token-${MYVAR}', mockLogger);
    expect(res).toBe('token-zzz');
  });
});

describe('resolveEnvDeep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deeply resolves env placeholders in objects', () => {
    process.env.A = '1';
    process.env.B = '2';
    const obj = { x: 'env:A', nested: { y: 'val-${B}' } };
    const out = resolveEnvDeep(obj, mockLogger) as any;
    expect(out.x).toBe('1');
    expect(out.nested.y).toBe('val-2');
  });
});

describe('initTranslatorEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvInitialization();
  });

  it('warns when translator.env file does not exist (does not create it)', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {};
    const mockFs = createMockFileSystem(files);

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify no files were written — initTranslatorEnv no longer creates the env file
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    // Should log a warning that the file is missing
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Environment file not found')
    );
  });

  it('loads environment when translator.env file exists', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {
      [`/test/workspace/${TRANSLATOR_ENV}`]: 'SOME_KEY=some-value'
    };
    const mockFs = createMockFileSystem(files);

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Should not write any files
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    // Should log that it's loading the file
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Loading environment from')
    );
  });

  it('skips initialization when already initialized', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {
      [`/test/workspace/${TRANSLATOR_ENV}`]: 'SOME_KEY=some-value'
    };
    const mockFs = createMockFileSystem(files);

    // First call
    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);
    vi.clearAllMocks();

    // Second call should skip
    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    expect(mockFs.fileExists).not.toHaveBeenCalled();
  });

  it('warns when rootDir is empty', async () => {
    resetEnvInitialization();
    const mockFs = createMockFileSystem({});

    await initTranslatorEnv('', mockLogger, mockFs);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine workspace directory')
    );
  });
});
