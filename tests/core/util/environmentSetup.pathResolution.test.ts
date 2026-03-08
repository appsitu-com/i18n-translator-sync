import { describe, it, expect, beforeEach } from 'vitest'
import { resolveEnvDeep, resolveEnvObjectWithDecryption } from '../../../src/core/util/environmentSetup'
import { Logger } from '../../../src/core/util/baseLogger'
import * as path from 'path'

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
    it('should resolve relative file path in key field when workspace path provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe(path.resolve('/workspace', 'keys/credentials.json'))
      expect(resolved.endpoint).toBe('https://api.example.com')
    })

    it('should keep absolute file path in key field unchanged', () => {
      const absolutePath = '/absolute/path/credentials.json'
      const config = {
        key: absolutePath,
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe(absolutePath)
      expect(path.isAbsolute(resolved.key)).toBe(true)
    })

    it('should not resolve key field when workspace path not provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvDeep(config, mockLogger)

      expect(resolved.key).toBe('keys/credentials.json')
    })

    it('should only resolve key field, not other fields', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'relative/path',
        url: 'another/relative/path'
      }

      const resolved = resolveEnvDeep(config, mockLogger, '/workspace')

      expect(resolved.key).toBe(path.resolve('/workspace', 'keys/credentials.json'))
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

      expect(resolved.translator.google.key).toBe(path.resolve('/workspace', 'keys/google.json'))
      expect(resolved.translator.azure.key).toBe(path.resolve('/workspace', 'keys/azure-key'))
    })
  })

  describe('resolveEnvObjectWithDecryption', () => {
    it('should resolve relative file path in key field when workspace path provided', () => {
      const config = {
        key: 'keys/credentials.json',
        endpoint: 'https://api.example.com'
      }

      const resolved = resolveEnvObjectWithDecryption(config, mockLogger, undefined, '/workspace')

      expect(resolved.key).toBe(path.resolve('/workspace', 'keys/credentials.json'))
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
      expect(path.isAbsolute(resolved.key)).toBe(true)
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

      expect(resolved[0].key).toBe(path.resolve('/workspace', 'keys/first.json'))
      expect(resolved[1].key).toBe(path.resolve('/workspace', 'keys/second.json'))
    })
  })
})
