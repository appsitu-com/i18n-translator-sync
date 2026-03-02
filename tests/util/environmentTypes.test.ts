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

  it('creates translator.env file when it does not exist', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {};
    const mockFs = createMockFileSystem(files);

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify the file was created
    expect(mockFs.writeFile).toHaveBeenCalled();
    const writeCall = (mockFs.writeFile as any).mock.calls[0];
    // Normalize path for cross-platform compatibility
    const normalizedPath = writeCall[0].path.replace(/\\/g, '/');
    expect(normalizedPath).toBe('/test/workspace/translator.env');
    expect(writeCall[1]).toContain('AZURE_TRANSLATION_KEY');
    expect(writeCall[1]).toContain('OPENROUTER_API_KEY');
    expect(writeCall[1]).toContain('GEMINI_API_KEY');
  });

  it('uses sample file content when available', async () => {
    resetEnvInitialization();
    const sampleContent = `# Sample content
AZURE_TRANSLATION_KEY='from-sample'
OPENROUTER_API_KEY='from-sample'
`;

    const files: Record<string, string> = {};
    // Add the sample file to the mock filesystem - simulate finding it in extension root
    const mockFs = createMockFileSystem(files);

    // Mock the sample file exists and has content
    (mockFs.fileExists as any).mockImplementation((uri: any) => {
      if (uri.path.includes('translator.env.sample')) {
        return Promise.resolve(true);
      }
      return Promise.resolve(files.hasOwnProperty(uri.path));
    });

    (mockFs.readFile as any).mockImplementation((uri: any) => {
      if (uri.path.includes('translator.env.sample')) {
        return Promise.resolve(sampleContent);
      }
      return Promise.resolve(files[uri.path] || '');
    });

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify the file was created with sample content
    expect(mockFs.writeFile).toHaveBeenCalled();
    const writeCall = (mockFs.writeFile as any).mock.calls[0];
    expect(writeCall[1]).toBe(sampleContent);
  });

  it('uses fallback content when sample file is not available', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {};
    const mockFs = createMockFileSystem(files);

    // Mock that sample file doesn't exist
    (mockFs.fileExists as any).mockImplementation((uri: any) => {
      return Promise.resolve(files.hasOwnProperty(uri.path));
    });

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify the file was created with fallback content
    expect(mockFs.writeFile).toHaveBeenCalled();
    const writeCall = (mockFs.writeFile as any).mock.calls[0];
    expect(writeCall[1]).toContain('AZURE_TRANSLATION_KEY');
    expect(writeCall[1]).toContain('OPENROUTER_API_KEY');
    expect(writeCall[1]).toContain('# You only need to configure keys');
  });

  it('does not create file when it already exists', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {
      [`/test/workspace/${TRANSLATOR_ENV}`]: 'existing content'
    };
    const mockFs = createMockFileSystem(files);

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify the translator.env file was not written (but .gitignore might still be written)
    const writeCalls = (mockFs.writeFile as any).mock.calls;
    const envFileCalls = writeCalls.filter((call: any) => call[0].path.endsWith(TRANSLATOR_ENV));
    expect(envFileCalls).toHaveLength(0);
  });

  it('adds translator.env to .gitignore', async () => {
    resetEnvInitialization();
    const files: Record<string, string> = {
      '/test/workspace/.gitignore': 'node_modules\n'
    };
    const mockFs = createMockFileSystem(files);

    await initTranslatorEnv('/test/workspace', mockLogger, mockFs);

    // Verify .gitignore was updated
    expect(mockFs.writeFile).toHaveBeenCalled();
    const writeCall = (mockFs.writeFile as any).mock.calls.find((call: any) =>
      call[0].path.includes('.gitignore')
    );
    expect(writeCall[1]).toContain(TRANSLATOR_ENV);
  });
});
