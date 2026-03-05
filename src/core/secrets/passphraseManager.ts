import * as vscode from 'vscode';
import { Logger, NO_OP_LOGGER } from '../util/baseLogger';

/**
 * Key used to encrypt/decrypt API keys in translator.env
 * Adds a prefix to encrypted keys
 */
const TRANSLATOR_KEY = 'translator-key';

export interface IPassphraseManager {
  loadPassphrase(): Promise<void>;
  setPassphrase(newPassphrase: string): Promise<void>;
  getPassphrase(): string | undefined;
  hasPassphrase(): boolean;
}

/**
 * Manages the encryption passphrase used for securing API keys
 */
export class PassphraseManager {
  private passphrase: string | undefined;

  /**
   * Create a new PassphraseManager
   *
   * @param context Optional VS Code extension context (not available in CLI/testing)
    * @param logger Logger instance
   */
    constructor(private context?: vscode.ExtensionContext, private logger: Logger = NO_OP_LOGGER) {
  }

  async initialize(): Promise<void> {
    return this.loadPassphrase()
  }

  /**
   * Load the passphrase from VS Code secrets storage
   */
  public async loadPassphrase(): Promise<void> {
    // Skip if not in VS Code environment
    if (!this.context) {
      return;
    }

    try {
      this.passphrase = await this.context.secrets.get(TRANSLATOR_KEY) || process.env.TRANSLATOR_KEY;
      if (this.passphrase) {
        this.logger.debug('Encryption passphrase loaded from secrets storage');
      } else {
        this.logger.debug('No encryption passphrase found in secrets storage');
      }
    } catch (error) {
      this.logger.error(`Error loading encryption passphrase: ${error}`);
      this.passphrase = undefined;
    }
  }

  /**
   * Set a new passphrase and store it in VS Code secrets
   *
   * @param newPassphrase The new passphrase to set
   */
  public async setPassphrase(newPassphrase: string): Promise<void> {
    try {
      if (!newPassphrase) {
        throw new Error('Passphrase cannot be empty');
      }

      // Always set the in-memory passphrase
      this.passphrase = newPassphrase;

      // Store the passphrase in secrets if in VS Code environment
      if (this.context) {
        await this.context.secrets.store(TRANSLATOR_KEY, newPassphrase);
        this.logger.info('Encryption passphrase set successfully');
      }
    } catch (error) {
      this.logger.error(`Error setting encryption passphrase: ${error}`);
      throw new Error(`Failed to set encryption passphrase: ${error}`);
    }
  }

  /**
   * Get the current passphrase
   *
   * @returns The current passphrase or undefined if not set
   */
  public getPassphrase(): string | undefined {
    return this.passphrase;
  }

  /**
   * Check if a passphrase is set
   *
   * @returns True if a passphrase is set
   */
  public hasPassphrase(): boolean {
    return !!this.passphrase;
  }

  /**
   * Clear the current passphrase from storage
   */
  public async clearPassphrase(): Promise<void> {
    try {
      // Always clear the in-memory passphrase
      this.passphrase = undefined;

      // Clear from secrets if in VS Code environment
      if (this.context) {
        await this.context.secrets.delete(TRANSLATOR_KEY);
        this.logger.info('Encryption passphrase cleared successfully');
      }
    } catch (error) {
      this.logger.error(`Error clearing encryption passphrase: ${error}`);
      throw new Error(`Failed to clear encryption passphrase: ${error}`);
    }
  }
}

// /**
//  * Singleton instance of the PassphraseManager
//  * This can be used in both VS Code and CLI environments
//  */
// export let passphraseManager = new PassphraseManager();

// /**
//  * Initialize the singleton PassphraseManager for VS Code environment
//  * This must be called once when the extension is activated
//  *
//  * @param context VS Code extension context
//  * @param logger Logger instance
//  */
// export function initializePassphraseManager(context: vscode.ExtensionContext, logger: Logger): void {
//   // Replace the singleton with a fully initialized instance
//   passphraseManager =  new PassphraseManager(context, logger)
// }