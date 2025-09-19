import * as vscode from 'vscode';
import { TranslatorAdapter } from '../core/adapters/baseAdapter';
import { WorkspaceWatcher } from '../core/util/watcher';
import { initTranslatorEnv } from '../core/util/environmentSetup';
import { VSCodeFileSystem } from './filesystem';
import { VSCodeLogger } from './vscodeLogger';
import { VSCodeWorkspaceWatcher } from './watcher';
import { VsCodeConfigProvider } from './vscodeConfig'

/**
 * VSCode adapter for the TranslatorManager
 */
export class VSCodeTranslatorAdapter extends TranslatorAdapter {
  private outputChannel: vscode.OutputChannel;
  private subscriptions: vscode.Disposable[] = [];
  private vsCodeLogger: VSCodeLogger;
  private vsCodeFileSystem: VSCodeFileSystem;
  private vsCodeConfigProvider: VsCodeConfigProvider;
  private initialized = false;

  constructor(outputChannel: vscode.OutputChannel) {
    // Create platform-specific components using the provided output channel
    const logger = new VSCodeLogger(outputChannel);
    const fileSystem = new VSCodeFileSystem();
    const configProvider = new VsCodeConfigProvider();

    // Get workspace path
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      throw new Error('No workspace folder found');
    }

    super(ws.uri.fsPath, logger, fileSystem, configProvider);

    // Store VSCode-specific components
    this.outputChannel = outputChannel;
    this.vsCodeLogger = logger;
    this.vsCodeFileSystem = fileSystem;
    this.vsCodeConfigProvider = configProvider;
  }

  /**
   * Implementation of the abstract method to handle file opens in VSCode
   */
  protected async handleFileOpen(path: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(path);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      this.logger.error(`Error opening file: ${error}`);
    }
  }

  /**
   * Implementation of the abstract method to create a workspace watcher for VSCode
   */
  protected createWatcher(): WorkspaceWatcher {
    return new VSCodeWorkspaceWatcher();
  }

  /**
   * Initialize the adapter for use during extension activation
   * This sets up everything needed for commands to work, but doesn't start watching
   */
  async initializeOnActivation(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration from .translator.json
      await this.vsCodeConfigProvider.load();

      // Initialize environment
      await initTranslatorEnv(
        this.workspacePath,
        this.logger,
        this.fileSystem,
        this.handleFileOpen.bind(this)
      );

      // Initialize the base adapter (creates translator manager but doesn't start watching)
      await this.initialize();

      this.initialized = true;
      this.logger.info('Translator initialized (not started)');
    } catch (error: any) {
      this.logger.error(`Error initializing translator: ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * VSCode-specific initialization
   */
  async initializeVSCode(): Promise<void> {
    // This method is now just an alias for backward compatibility
    await this.initializeOnActivation();
  }

  /**
   * Start the translator with VSCode-specific initialization
   * @param context VSCode extension context
   */
  async startWithContext(_context: vscode.ExtensionContext): Promise<void> {
    // Check if already running
    if (this.running) {
      vscode.window.showInformationMessage('Translator already running');
      return;
    }

    try {
      // Ensure we're initialized (this is idempotent)
      await this.initializeOnActivation();

      // Start watching for file changes and performing translations
      await this.start();

      // Show VSCode-specific success message
      vscode.window.showInformationMessage('Translator started');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error starting translator: ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Override the stop method to show VSCode-specific messages
   */
  stop(): void {
    super.stop();

    if (!this.running) {
      vscode.window.showInformationMessage('Translator stopped');
    }
  }

  /**
   * Restart the translator with VSCode context
   * @param context VSCode extension context
   */
  async restartWithContext(_context: vscode.ExtensionContext): Promise<void> {
    this.stop();
    await this.startWithContext(_context);
  }

  /**
   * Override the pushToMateCat method to add VSCode-specific messaging
   */
  async pushToMateCat(): Promise<void> {
    // Ensure we're initialized but don't require the translator to be running
    await this.initializeOnActivation();

    if (!this.translatorManager) {
      vscode.window.showErrorMessage('Translator not initialized properly');
      return;
    }

    try {
      await super.pushToMateCat();
      vscode.window.showInformationMessage('Successfully pushed translations to MateCat');
    } catch (e: any) {
      vscode.window.showErrorMessage(`MateCat push failed: ${e.message}`);
    }
  }

  /**
   * Override the pullFromMateCat method to add VSCode-specific messaging
   */
  async pullFromMateCat(): Promise<void> {
    // Ensure we're initialized but don't require the translator to be running
    await this.initializeOnActivation();

    if (!this.translatorManager) {
      vscode.window.showErrorMessage('Translator not initialized properly');
      return;
    }

    try {
      await super.pullFromMateCat();
      vscode.window.showInformationMessage('Successfully pulled translations from MateCat');
    } catch (e: any) {
      vscode.window.showErrorMessage(`MateCat pull failed: ${e.message}`);
    }
  }

  /**
   * Show the output channel
   */
  showOutput(): void {
    this.outputChannel.appendLine(`Output channel shown at: ${new Date().toISOString()}`);
    this.outputChannel.appendLine("Available commands:");
    this.outputChannel.appendLine('- Translator: Start (starts file watching and auto-translation)');
    this.outputChannel.appendLine('- Translator: Stop (stops file watching)');
    this.outputChannel.appendLine('- Translator: Restart (restart watching)');
    this.outputChannel.appendLine('- Translator: Push to MateCat (works without starting)');
    this.outputChannel.appendLine('- Translator: Pull from MateCat (works without starting)');
    this.outputChannel.appendLine('- Translator: Show Output (this command)');

    if (this.running) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('Status: Translator is currently RUNNING (watching for file changes)');
    } else {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('Status: Translator is STOPPED (not watching for file changes)');
    }

    this.outputChannel.show();
  }

  /**
   * Check if the adapter has been initialized (separate from ready/running state)
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current status including VSCode-specific initialization state
   */
  getStatus(): { initialized: boolean; ready: boolean; running: boolean } {
    const baseStatus = super.getStatus();
    return {
      initialized: this.initialized,
      ready: baseStatus.initialized,
      running: baseStatus.running
    };
  }

  /**
   * Check if the adapter is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    super.dispose();

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }

    this.subscriptions = [];
  }
}