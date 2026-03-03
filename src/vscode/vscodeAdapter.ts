import { PassphraseManager } from '../core/secrets/passphraseManager'
import * as vscode from 'vscode'
import { TranslatorAdapter } from '../core/adapters/baseAdapter'
import { WorkspaceWatcher } from '../core/util/watcher'
import { VSCodeFileSystem } from './filesystem'
import { VSCodeWorkspaceWatcher } from './watcher'
import { VsCodeConfigProvider } from './vscodeConfig'
import { EncryptedKeyAccessError } from '../core/util/environmentSetup'
import { Logger } from '../core/util/baseLogger'

/**
 * VSCode adapter for the TranslatorManager
 */
export class VSCodeTranslatorAdapter extends TranslatorAdapter {
  private subscriptions: vscode.Disposable[] = []
  private initialized = false
  private passphraseManager: PassphraseManager | null = null

  constructor(logger: Logger) {
    // Create platform-specific components using the provided output channel
    const fileSystem = new VSCodeFileSystem()
    const configProvider = new VsCodeConfigProvider()

    // Get workspace path
    const ws = vscode.workspace.workspaceFolders?.[0]
    if (!ws) {
      throw new Error('No workspace folder found')
    }

    super(ws.uri.fsPath, logger, fileSystem, configProvider)
  }

  /**
   * Get the passphrase
   */
  private async getPassphrase(): Promise<string | undefined> {
    if (!this.passphraseManager) {
      return undefined
    }

    // If we already have a passphrase, use it
    if (this.passphraseManager.hasPassphrase()) {
      return this.passphraseManager.getPassphrase()
    }

    // Try to load the passphrase
    await this.passphraseManager.loadPassphrase()

    if (this.passphraseManager.hasPassphrase()) {
      return this.passphraseManager.getPassphrase()
    }

    // If no passphrase is stored, ask the user
    const passphrase = await vscode.window.showInputBox({
      prompt: 'Enter your encryption passphrase to access API keys',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'Encryption passphrase'
    })

    // Save it for future use during this session
    if (passphrase) {
      await this.passphraseManager.setPassphrase(passphrase)
    }

    return passphrase
  }

  /**
   * Implementation of the abstract method to handle file opens in VSCode
   */
  protected async openDocument(path: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(path)
      await vscode.window.showTextDocument(doc)
    } catch (error) {
      this.logger.error(`Error opening file: ${error}`)
    }
  }

  /**
   * Implementation of the abstract method to create a workspace watcher for VSCode
   */
  protected createWatcher(): WorkspaceWatcher {
    // Get the workspace folder for the watcher
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found for creating watcher');
    }

    return new VSCodeWorkspaceWatcher(workspaceFolder);
  }

  /**
   * Initialize the adapter for use during extension activation
   * This sets up everything needed for commands to work, but doesn't start watching
   */
  async initializeOnActivation(context?: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      if (context && !this.passphraseManager) {
        this.passphraseManager = new PassphraseManager(context, this.logger)
      }

      await this.initialize()

      this.initialized = true
      this.logger.info('Translator initialized (not started)')
    } catch (error: any) {
      this.logger.error(`Error initializing translator: ${error.message || String(error)}`)
      throw error
    }
  }

  // /**
  //  * VSCode-specific initialization
  //  */
  // async initializeVSCode(): Promise<void> {
  //   // This method is now just an alias for backward compatibility
  //   await this.initializeOnActivation();
  // }

  protected getPassphraseManager(): PassphraseManager | undefined {
    return this.passphraseManager ?? undefined
  }

  /**
   * Start the translator with VSCode-specific initialization
   * @param context VSCode extension context
   */
  async startWithContext(context: vscode.ExtensionContext): Promise<void> {
    // Check if already running
    if (this.running) {
      vscode.window.showInformationMessage('Translator already running')
      return
    }

    try {
      // Ensure we're initialized (this is idempotent)
      await this.initializeOnActivation(context)

      // Start watching for file changes and performing translations
      try {
        // Get the passphrase once - it's already stored in the singleton
        await this.getPassphrase()

        // Start the translator
        await this.start()
      } catch (error) {
        if (error instanceof EncryptedKeyAccessError) {
          // Prompt user to set up encryption
          const action = await vscode.window.showErrorMessage(
            `Unable to access encrypted API key: ${error.message}`,
            'Set Up Encryption',
            'Cancel'
          )

          if (action === 'Set Up Encryption' && this.passphraseManager) {
            const setupEncryptionCommand = 'translator.setupEncryption'
            await vscode.commands.executeCommand(setupEncryptionCommand)

            // Try again after setting up encryption
            await this.getPassphrase()

            // Start the translator
            await this.start()
          } else {
            throw error // Re-throw if the user cancelled
          }
        } else {
          throw error // Re-throw other errors
        }
      }

      // Show VSCode-specific success message
      vscode.window.showInformationMessage('Translator started')
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error starting translator: ${error.message || String(error)}`)
      throw error
    }
  }

  /**
   * Override the stop method to show VSCode-specific messages
   */
  stop(): void {
    super.stop()

    if (!this.running) {
      vscode.window.showInformationMessage('Translator stopped')
    }
  }

  /**
   * Restart the translator with VSCode context
   * @param context VSCode extension context
   */
  async restartWithContext(context: vscode.ExtensionContext): Promise<void> {
    this.stop()
    await this.startWithContext(context)
  }

  /**
   * Override the pushToMateCat method to add VSCode-specific messaging
   */
  async pushToMateCat(): Promise<void> {
    // Ensure we're initialized but don't require the translator to be running
    await this.initializeOnActivation()

    if (!this.translatorManager) {
      vscode.window.showErrorMessage('Translator not initialized properly')
      return
    }

    try {
      await super.pushToMateCat()
      vscode.window.showInformationMessage('Successfully pushed translations to MateCat')
    } catch (e: any) {
      vscode.window.showErrorMessage(`MateCat push failed: ${e.message}`)
    }
  }

  /**
   * Override the pullFromMateCat method to add VSCode-specific messaging
   */
  async pullFromMateCat(): Promise<void> {
    // Ensure we're initialized but don't require the translator to be running
    await this.initializeOnActivation()

    if (!this.translatorManager) {
      vscode.window.showErrorMessage('Translator not initialized properly')
      return
    }

    try {
      await super.pullFromMateCat()
      vscode.window.showInformationMessage('Successfully pulled translations from MateCat')
    } catch (e: any) {
      vscode.window.showErrorMessage(`MateCat pull failed: ${e.message}`)
    }
  }

  /**
   * Check if the adapter has been initialized (separate from ready/running state)
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get the current status including VSCode-specific initialization state
   */
  getStatus(): { initialized: boolean; ready: boolean; running: boolean } {
    const baseStatus = super.getStatus()
    return {
      initialized: this.initialized,
      ready: baseStatus.initialized,
      running: baseStatus.running
    }
  }

  /**
   * Check if the adapter is currently running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    super.dispose()

    for (const subscription of this.subscriptions) {
      subscription.dispose()
    }

    this.subscriptions = []
  }
}
