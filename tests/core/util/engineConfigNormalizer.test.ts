import { describe, it, expect } from 'vitest';
import { normalizeAzureConfig, mergeEngineConfig } from '../../../src/core/util/engineConfigNormalizer';

describe('engineConfigNormalizer', () => {
  describe('normalizeAzureConfig', () => {
    it('should normalize apiKey to key', () => {
      const config = {
        apiKey: 'test-key',
        region: 'westus'
      };
      const result = normalizeAzureConfig(config);
      expect(result).toEqual({
        key: 'test-key',
        region: 'westus'
      });
      expect(result.apiKey).toBeUndefined();
    });

    it('should not override key if both key and apiKey exist', () => {
      const config = {
        key: 'primary-key',
        apiKey: 'secondary-key',
        region: 'westus'
      };
      const result = normalizeAzureConfig(config);
      expect(result.key).toBe('primary-key');
      expect(result.apiKey).toBeUndefined();
    });

    it('should normalize url to endpoint', () => {
      const config = {
        key: 'test-key',
        region: 'westus',
        url: 'https://api.example.com'
      };
      const result = normalizeAzureConfig(config);
      expect(result).toEqual({
        key: 'test-key',
        region: 'westus',
        endpoint: 'https://api.example.com'
      });
      expect(result.url).toBeUndefined();
    });

    it('should not override endpoint if both endpoint and url exist', () => {
      const config = {
        key: 'test-key',
        region: 'westus',
        endpoint: 'https://api.primary.com',
        url: 'https://api.secondary.com'
      };
      const result = normalizeAzureConfig(config);
      expect(result.endpoint).toBe('https://api.primary.com');
      expect(result.url).toBeUndefined();
    });

    it('should preserve all other fields', () => {
      const config = {
        apiKey: 'test-key',
        region: 'westus',
        url: 'https://api.example.com',
        azureModel: 'custom-model',
        timeout: 5000
      };
      const result = normalizeAzureConfig(config);
      expect(result).toEqual({
        key: 'test-key',
        region: 'westus',
        endpoint: 'https://api.example.com',
        azureModel: 'custom-model',
        timeout: 5000
      });
    });

    it('should handle empty config', () => {
      const result = normalizeAzureConfig({});
      expect(result).toEqual({});
    });

    it('should handle config with only normalized fields', () => {
      const config = {
        key: 'test-key',
        region: 'westus',
        endpoint: 'https://api.example.com'
      };
      const result = normalizeAzureConfig(config);
      expect(result).toEqual({
        key: 'test-key',
        region: 'westus',
        endpoint: 'https://api.example.com'
      });
    });
  });

  describe('mergeEngineConfig', () => {
    it('should merge non-empty values', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region',
        endpoint: 'https://default.com'
      };
      const overrides = {
        key: 'override-key',
        region: 'override-region'
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        key: 'override-key',
        region: 'override-region',
        endpoint: 'https://default.com'
      });
    });

    it('should not override with empty string', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region',
        endpoint: 'https://default.com'
      };
      const overrides = {
        key: 'override-key',
        region: ''
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        key: 'override-key',
        region: 'default-region',
        endpoint: 'https://default.com'
      });
    });

    it('should not override with null', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region'
      };
      const overrides = {
        key: 'override-key',
        region: null
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        key: 'override-key',
        region: 'default-region'
      });
    });

    it('should not override with undefined', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region'
      };
      const overrides = {
        key: 'override-key',
        region: undefined
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        key: 'override-key',
        region: 'default-region'
      });
    });

    it('should allow overriding with falsy non-empty values', () => {
      const defaults = {
        count: 10,
        enabled: true
      };
      const overrides = {
        count: 0,
        enabled: false
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        count: 0,
        enabled: false
      });
    });

    it('should add new fields from overrides', () => {
      const defaults = {
        key: 'default-key'
      };
      const overrides = {
        region: 'new-region',
        endpoint: 'https://new.com'
      };
      const result = mergeEngineConfig(defaults, overrides);
      expect(result).toEqual({
        key: 'default-key',
        region: 'new-region',
        endpoint: 'https://new.com'
      });
    });

    it('should handle empty overrides', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region'
      };
      const result = mergeEngineConfig(defaults, {});
      expect(result).toEqual({
        key: 'default-key',
        region: 'default-region'
      });
    });

    it('should not modify original objects', () => {
      const defaults = {
        key: 'default-key',
        region: 'default-region'
      };
      const overrides = {
        key: 'override-key'
      };
      const result = mergeEngineConfig(defaults, overrides);

      expect(defaults.key).toBe('default-key');
      expect(overrides.key).toBe('override-key');
      expect(result.key).toBe('override-key');
    });
  });

  describe('integration: normalizeAzureConfig + mergeEngineConfig', () => {
    it('should correctly handle Azure config from translator.json with env substitution', () => {
      // Simulate default config from process.env
      const defaults = {
        key: 'env-key-123',
        region: 'westus',
        url: 'https://api.cognitive.microsofttranslator.com'
      };

      // Simulate translator.json after env substitution
      const translatorJson = {
        apiKey: 'json-key-456',  // Different field name
        region: 'eastus',         // Override region
        endpoint: 'https://custom.api.com'  // Different field name
      };

      // Normalize field names
      const normalized = normalizeAzureConfig(translatorJson);

      // Merge with defaults
      const final = mergeEngineConfig(defaults, normalized);

      expect(final).toEqual({
        key: 'json-key-456',
        region: 'eastus',
        url: 'https://api.cognitive.microsofttranslator.com',
        endpoint: 'https://custom.api.com'
      });
    });

    it('should handle empty env substitution results', () => {
      const defaults = {
        key: 'env-key-123',
        region: 'westus',
        endpoint: 'https://api.cognitive.microsofttranslator.com'
      };

      // Simulate translator.json with failed env substitution (empty strings)
      const translatorJson = {
        apiKey: '',     // Empty after failed substitution
        region: '',     // Empty after failed substitution
        endpoint: ''    // Empty after failed substitution
      };

      const normalized = normalizeAzureConfig(translatorJson);
      const final = mergeEngineConfig(defaults, normalized);

      // Should keep defaults since overrides are all empty
      expect(final).toEqual({
        key: 'env-key-123',
        region: 'westus',
        endpoint: 'https://api.cognitive.microsofttranslator.com'
      });
    });

    it('should handle partial env substitution', () => {
      const defaults = {
        key: 'env-key-123',
        region: 'westus',
        endpoint: 'https://default.com'
      };

      // Some vars substituted, some not
      const translatorJson = {
        apiKey: 'custom-key',  // Successfully substituted
        region: '',             // Failed substitution
        endpoint: 'https://custom.com'  // Successfully substituted
      };

      const normalized = normalizeAzureConfig(translatorJson);
      const final = mergeEngineConfig(defaults, normalized);

      expect(final).toEqual({
        key: 'custom-key',      // Overridden
        region: 'westus',        // Kept default (override was empty)
        endpoint: 'https://custom.com'  // Overridden
      });
    });
  });
});
