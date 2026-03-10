import { describe, it, expect, beforeEach } from 'vitest'
import { resolveEnvDeep, resolveEnvObjectWithDecryption } from '../../../src/core/util/environmentSetup'
import { Logger } from '../../../src/core/util/baseLogger'

describe('Environment Setup - File Path Resolution', () => {
  let mockLogger: Logger

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    } as any
  })

  describe('resolveEnvDeep', () => {
    it('should not resolve relative key values into absolute paths when workspace path provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe('keys/credentials.json')
      expect(resolved.endpoint).toBe('https://api.example.com')
    })

    it('should keep absolute key-like values unchanged', () => {
      const absolutePath = '/absolute/path/credentials.json'
      const config = {
        key: absolutePath,
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe(absolutePath)
    })

    it('should not resolve key field when workspace path not provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger)

      expect(resolved.key).toBe('keys/credentials.json')
    })

    it('should not resolve key field or other fields to absolute paths', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'relative/path',
        url: 'another/relative/path'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe('keys/credentials.json')
      expect(resolved.endpoint).toBe('relative/path')
      expect(resolved.url).toBe('another/relative/path')
    })

    it('should handle nested objects with key field', () => {
      const config = {
        translator: {
          google: {
            key: 'keys/google.json'
          },
          azure: {
            key: 'keys/azure-key'
          }
        }
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.translator.google.key).toBe('keys/google.json')
      expect(resolved.translator.azure.key).toBe('keys/azure-key')
    })

    it('should preserve api keys that are not file paths', () => {
      const config = {
        key: 'G2BxK8ASiq6pJsJ342mBTFQkOz8cCDd4Wv4lQgPiJjuDz4d6LrfZJQQJ99CCAC4f1cMXJ3w3AAAbACOGWizE'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe(config.key)
    })
  })

  describe('resolveEnvObjectWithDecryption', () => {
    it('should not resolve relative key values into absolute paths when workspace path provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvObjectWithDecryption(config, mockLogger, undefined, '/workspace')

      expect(resolved.key).toBe('keys/credentials.json')
      expect(resolved.endpoint).toBe('https://api.example.com')
    })

    it('should keep absolute file path in key field unchanged', () => {
      const absolutePath = '/absolute/path/credentials.json'
      const config = {
        key: absolutePath,
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvObjectWithDecryption(config, mockLogger, undefined, '/workspace')

      expect(resolved.key).toBe(absolutePath)
    })

    it('should not resolve key field when workspace path not provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvObjectWithDecryption(config, mockLogger)

      expect(resolved.key).toBe('keys/credentials.json')
    })

    it('should handle arrays with objects containing key field', () => {
      const config = [
        { key: 'keys/first.json', name: 'first' },
        { key: 'keys/second.json', name: 'second' }
      ]

      const resolved = resolveEnvObjectWithDecryption(config, mockLogger, undefined, '/workspace')

      expect(resolved[0].key).toBe('keys/first.json')
      expect(resolved[1].key).toBe('keys/second.json')
    })
  })
})
