import * as vscode from 'vscode';
import * as path from 'path';
import { TranslatorAdapter } from '../core/adapters/baseAdapter';
import { WorkspaceWatcher } from '../core/util/watcher';
import { initTranslatorEnv } from '../core/util/env';
import { VSCodeFileSystem } from './filesystem';
import { VSCodeLogger } from './logger';
import { VSCodeWorkspaceWatcher } from './watcher';
import { VsCodeConfigProvider } from './config';

/**
 * VSCode adapter for the TranslatorManager
 */
export class VSCodeTranslatorAdapter extends TranslatorAdapter {
  private outputChannel: vscode.OutputChannel;
  private subscriptions: vscode.Disposable[] = [];
  private vsCodeLogger: VSCodeLogger;
  private vsCodeFileSystem: VSCodeFileSystem;
  private vsCodeConfigProvider: VsCodeConfigProvider;

  constructor() {
    // Create platform-specific components
    const outputChannel = vscode.window.createOutputChannel('i18n Translator');
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
   * VSCode-specific initialization
   */
  async initializeVSCode(): Promise<void> {
    // Initialize environment
    await initTranslatorEnv(
      this.workspacePath,
      this.logger,
      this.fileSystem,
      this.handleFileOpen.bind(this)
    );
  }

  /**
   * Start the translator with VSCode-specific initialization
   * @param context VSCode extension context
   */
  async startWithContext(context: vscode.ExtensionContext): Promise<void> {
    // Check if already running
    if (this.running) {
      vscode.window.showInformationMessage('Translator already running');
      return;
    }

    try {
      await this.initializeVSCode();
      await this.initialize();
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
  async restartWithContext(context: vscode.ExtensionContext): Promise<void> {
    this.stop();
    await this.startWithContext(context);
  }

  /**
   * Override the pushToMateCat method to add VSCode-specific messaging
   */
  async pushToMateCat(): Promise<void> {
    if (!this.translatorManager) {
      vscode.window.showInformationMessage('Translator not running. Start the translator first.');
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
    if (!this.translatorManager) {
      vscode.window.showInformationMessage('Translator not running. Start the translator first.');
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
    this.outputChannel.appendLine("If you don't see any logs, try running one of the translator commands:");
    this.outputChannel.appendLine('- Translator: Start');
    this.outputChannel.appendLine('- Translator: Stop');
    this.outputChannel.appendLine('- Translator: Restart');
    this.outputChannel.show();
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