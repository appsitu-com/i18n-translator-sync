import { it, expect, describe } from 'vitest';
import { resolveEnvString, resolveEnvDeep, MissingEnvVarError } from '../../src/util/env';

it('creates MissingEnvVarError with correct message', () => {
  const err = new MissingEnvVarError('MY_VAR');
  expect(err).toBeInstanceOf(MissingEnvVarError);
  expect(err.message).toMatch(/MY_VAR/);
});


describe('resolveEnvString', () => {
  it('returns value directly if not string', () => {
    expect(resolveEnvString(123)).toBe(123);
  });
  it('resolves env:VAR_NAME', () => {
    process.env.TEST_ENV = 'abc';
    expect(resolveEnvString('env:TEST_ENV')).toBe('abc');
  });
  it('throws MissingEnvVarError when unset', () => {
    delete process.env.NO_VAR;
    expect(() => resolveEnvString('env:NO_VAR')).toThrow(MissingEnvVarError);
  });
  it('resolves ${VAR} in strings', () => {
    process.env.MYVAR = 'zzz';
    const res = resolveEnvString('token-${MYVAR}');
    expect(res).toBe('token-zzz');
  });
});

describe('resolveEnvDeep', () => {
  it('deeply resolves env placeholders in objects', () => {
    process.env.A = '1';
    process.env.B = '2';
    const obj = { x: 'env:A', nested: { y: 'val-${B}' } };
    const out = resolveEnvDeep(obj) as any;
    expect(out.x).toBe('1');
    expect(out.nested.y).toBe('val-2');
  });
});
