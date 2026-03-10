import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { substituteEnvVars, substituteEnvVarsInObject } from '../../../src/core/util/envSubstitution';

describe('envSubstitution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a new environment for each test
    process.env = { ...originalEnv };
    process.env.TEST_VAR = 'test-value';
    process.env.API_KEY = 'secret-key-123';
    process.env.ENDPOINT = 'https://api.example.com';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('substituteEnvVars', () => {
    it('should substitute a single environment variable', () => {
      const result = substituteEnvVars('${TEST_VAR}');
      expect(result).toBe('test-value');
    });

    it('should substitute multiple environment variables', () => {
      const result = substituteEnvVars('${API_KEY}:${ENDPOINT}');
      expect(result).toBe('secret-key-123:https://api.example.com');
    });

    it('should handle mixed content with environment variables', () => {
      const result = substituteEnvVars('API key is ${API_KEY} at ${ENDPOINT}');
      expect(result).toBe('API key is secret-key-123 at https://api.example.com');
    });

    it('should return empty string for undefined environment variables', () => {
      const result = substituteEnvVars('${UNDEFINED_VAR}');
      expect(result).toBe('');
    });

    it('should handle text without environment variables', () => {
      const result = substituteEnvVars('plain text');
      expect(result).toBe('plain text');
    });

    it('should handle empty string', () => {
      const result = substituteEnvVars('');
      expect(result).toBe('');
    });

    it('should handle malformed variable syntax', () => {
      const result = substituteEnvVars('${INCOMPLETE');
      expect(result).toBe('${INCOMPLETE');
    });

    it('should handle nested braces', () => {
      const result = substituteEnvVars('${TEST_VAR} and ${API_KEY}');
      expect(result).toBe('test-value and secret-key-123');
    });
  });

  describe('substituteEnvVarsInObject', () => {
    it('should substitute in string values', () => {
      const obj = { key: '${API_KEY}' };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({ key: 'secret-key-123' });
    });

    it('should substitute in nested objects', () => {
      const obj = {
        api: {
          key: '${API_KEY}',
          endpoint: '${ENDPOINT}'
        }
      };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({
        api: {
          key: 'secret-key-123',
          endpoint: 'https://api.example.com'
        }
      });
    });

    it('should substitute in arrays', () => {
      const obj = {
        keys: ['${API_KEY}', '${TEST_VAR}']
      };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({
        keys: ['secret-key-123', 'test-value']
      });
    });

    it('should handle mixed types', () => {
      const obj = {
        string: '${API_KEY}',
        number: 42,
        boolean: true,
        null: null,
        nested: {
          value: '${TEST_VAR}'
        }
      };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({
        string: 'secret-key-123',
        number: 42,
        boolean: true,
        null: null,
        nested: {
          value: 'test-value'
        }
      });
    });

    it('should not modify the original object', () => {
      const obj = { key: '${API_KEY}' };
      const result = substituteEnvVarsInObject(obj);
      expect(obj.key).toBe('${API_KEY}');
      expect(result.key).toBe('secret-key-123');
    });

    it('should handle arrays of objects', () => {
      const obj = {
        configs: [
          { key: '${API_KEY}' },
          { key: '${TEST_VAR}' }
        ]
      };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({
        configs: [
          { key: 'secret-key-123' },
          { key: 'test-value' }
        ]
      });
    });

    it('should handle primitives', () => {
      expect(substituteEnvVarsInObject('${API_KEY}')).toBe('secret-key-123');
      expect(substituteEnvVarsInObject(42)).toBe(42);
      expect(substituteEnvVarsInObject(true)).toBe(true);
      expect(substituteEnvVarsInObject(null)).toBe(null);
    });

    it('should handle deeply nested structures', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              key: '${API_KEY}',
              array: ['${TEST_VAR}', 'plain']
            }
          }
        }
      };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              key: 'secret-key-123',
              array: ['test-value', 'plain']
            }
          }
        }
      });
    });

    it('should handle empty objects and arrays', () => {
      expect(substituteEnvVarsInObject({})).toEqual({});
      expect(substituteEnvVarsInObject([])).toEqual([]);
    });

    it('should substitute multiple variables in one string', () => {
      const obj = { connection: '${API_KEY}@${ENDPOINT}' };
      const result = substituteEnvVarsInObject(obj);
      expect(result).toEqual({ connection: 'secret-key-123@https://api.example.com' });
    });
  });
});
