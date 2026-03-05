import { Logger, NO_OP_LOGGER } from '../util/baseLogger'
import { IPassphraseManager } from './passphraseManager'

/**
 * Simple IPassphraseManager implementation that reads from environment variables (CLI use).
 */
export class EnvPassphraseManager implements IPassphraseManager {
  private passphrase: string | undefined

  constructor(private readonly envVar: string = 'TRANSLATOR_KEY', private readonly logger: Logger = NO_OP_LOGGER) {}

  async loadPassphrase(): Promise<void> {
    this.passphrase = process.env[this.envVar]
    if (this.passphrase) {
      this.logger.debug(`Loaded passphrase from ${this.envVar}`)
    } else {
      this.logger.debug(`No passphrase found in ${this.envVar}`)
    }
  }

  async setPassphrase(newPassphrase: string): Promise<void> {
    if (!newPassphrase) {
      throw new Error('Passphrase cannot be empty')
    }
    this.passphrase = newPassphrase
    process.env[this.envVar] = newPassphrase
  }

  getPassphrase(): string | undefined {
    return this.passphrase
  }

  hasPassphrase(): boolean {
    return !!this.passphrase
  }
}
