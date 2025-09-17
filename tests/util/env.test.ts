import { it, expect, describe, beforeEach, vi } from 'vitest';
import { resolveEnvString, resolveEnvDeep, MissingEnvVarError, getEnv } from '../../src/core/util/env';

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
