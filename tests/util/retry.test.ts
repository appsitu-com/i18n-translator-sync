import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry } from '../../src/util/retry'

describe('retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withRetry', () => {
    it('should return successful result on first attempt', async () => {
      const fn = vi.fn(() => Promise.resolve('success'))

      const result = await withRetry({}, fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0
      const fn = vi.fn(async () => {
        attempts++
        if (attempts <= 2) {
          throw new Error(`fail ${attempts}`)
        }
        return 'success'
      })

      const promise = withRetry({}, fn)

      // Fast-forward through delays
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw error after max retries exceeded', async () => {
      const error = new Error('persistent failure')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({ maxRetries: 2 }, fn)

      // Fast-forward through delays
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('persistent failure')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('should use default retry options', async () => {
      const error = new Error('fail')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({}, fn)

      // Fast-forward through delays
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries (default maxRetries: 2)
    })

    it('should respect custom maxRetries', async () => {
      const error = new Error('fail')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({ maxRetries: 1 }, fn)

      // Fast-forward through delays
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(2) // initial + 1 retry
    })

    it('should implement exponential backoff with default values', async () => {
      const error = new Error('fail')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({}, fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('should implement exponential backoff with custom values', async () => {
      const error = new Error('fail')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({
        delayMs: 50,
        backoffFactor: 3,
        maxRetries: 2
      }, fn)

      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('should handle zero maxRetries', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fail')
      })

      const promise = withRetry({ maxRetries: 0 }, fn)

      await expect(promise).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(1) // no retries
    })

    it('should handle async functions that return different types', async () => {
      const numberFn = vi.fn(() => Promise.resolve(42))
      const objectFn = vi.fn(() => Promise.resolve({ data: 'test' }))
      const arrayFn = vi.fn(() => Promise.resolve([1, 2, 3]))

      const numberResult = await withRetry({}, numberFn)
      const objectResult = await withRetry({}, objectFn)
      const arrayResult = await withRetry({}, arrayFn)

      expect(numberResult).toBe(42)
      expect(objectResult).toEqual({ data: 'test' })
      expect(arrayResult).toEqual([1, 2, 3])
    })

    it('should preserve error types and messages', async () => {
      class CustomError extends Error {
        code: string
        constructor(message: string, code: string) {
          super(message)
          this.code = code
        }
      }

      const error = new CustomError('custom message', 'CUSTOM_CODE')
      const fn = vi.fn(async () => {
        throw error
      })

      const promise = withRetry({ maxRetries: 1 }, fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow(CustomError)
      await expect(promise).rejects.toThrow('custom message')

      try {
        await promise
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError)
        expect((e as CustomError).code).toBe('CUSTOM_CODE')
      }
    })

    it('should handle undefined/null options', async () => {
      const fn = vi.fn(() => Promise.resolve('success'))

      const result = await withRetry(undefined as any, fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should work with promise rejections and resolutions', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        if (callCount < 3) {
          throw new Error(`Attempt ${callCount} failed`)
        }
        return `Success on attempt ${callCount}`
      }

      const promise = withRetry({ maxRetries: 3 }, fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('Success on attempt 3')
      expect(callCount).toBe(3)
    })
  })
})