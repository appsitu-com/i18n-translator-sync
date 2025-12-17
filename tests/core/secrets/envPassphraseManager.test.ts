import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnvPassphraseManager } from '../../../src/core/secrets/envPassphraseManager'
import { Logger } from '../../../src/core/util/baseLogger'

const ENV_VAR = 'TRANSLATOR_KEY'

const createLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn()
})

describe('EnvPassphraseManager', () => {
  const originalEnv = process.env[ENV_VAR]
  let logger: Logger
  let manager: EnvPassphraseManager

  beforeEach(() => {
    logger = createLogger()
    manager = new EnvPassphraseManager(ENV_VAR, logger)
    delete process.env[ENV_VAR]
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_VAR]
    } else {
      process.env[ENV_VAR] = originalEnv
    }
  })

  it('loads passphrase from environment', async () => {
    process.env[ENV_VAR] = 'from-env'

    await manager.loadPassphrase()

    expect(manager.getPassphrase()).toBe('from-env')
    expect(manager.hasPassphrase()).toBe(true)
    expect(logger.debug).toHaveBeenCalledWith(`Loaded passphrase from ${ENV_VAR}`)
  })

  it('handles missing environment variable', async () => {
    await manager.loadPassphrase()

    expect(manager.getPassphrase()).toBeUndefined()
    expect(manager.hasPassphrase()).toBe(false)
    expect(logger.debug).toHaveBeenCalledWith(`No passphrase found in ${ENV_VAR}`)
  })

  it('sets and retains passphrase in memory and environment', async () => {
    await manager.setPassphrase('new-secret')

    expect(manager.getPassphrase()).toBe('new-secret')
    expect(manager.hasPassphrase()).toBe(true)
    expect(process.env[ENV_VAR]).toBe('new-secret')
  })

  it('rejects empty passphrase', async () => {
    await expect(manager.setPassphrase('')).rejects.toThrow('Passphrase cannot be empty')
  })
})
