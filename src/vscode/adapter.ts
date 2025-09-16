import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TranslatorManager } from '../core/translatorManager';
import { loadProjectConfig } from '../core/config';
import { initTranslatorEnv } from '../core/util/env';
import { VSCodeFileSystem, VSCodeUri } from './filesystem';
import { VSCodeLogger } from './logger';
import { VSCodeWorkspaceWatcher } from './watcher';
import { SQLiteCache } from '../core/cache/sqlite';
import { pushCacheToMateCat, pullReviewedFromMateCat } from '../matecate';
import { VsCodeConfigProvider } from './config';

/**
 * VSCode adapter for the TranslatorManager
 */
export class VSCodeTranslatorAdapter {
  private translatorManager: TranslatorManager | null = null;
  private outputChannel: vscode.OutputChannel;
  private cache: SQLiteCache | undefined;
  private logger: VSCodeLogger;
  private fileSystem: VSCodeFileSystem;
  private subscriptions: vscode.Disposable[] = [];

  constructor() {
    // Create platform-specific components
    this.outputChannel = vscode.window.createOutputChannel('i18n Translator');
    this.logger = new VSCodeLogger(this.outputChannel);
    this.fileSystem = new VSCodeFileSystem();
  }

  /**
   * Config provider
   */
  private configProvider = new VsCodeConfigProvider();

  /**
   * Get or create the cache
   */
  private getCache(dbMustExist = false): SQLiteCache | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showInformationMessage('VSCode workspace is not opened');
      return undefined;
    }

    const dbPath = path.join(ws.uri.fsPath, '.i18n-cache', 'translation.db');
    if (dbMustExist && !fs.existsSync(dbPath)) {
      vscode.window.showInformationMessage(
        `${dbPath}: Translation cache not found. Start the translator to create it.`
      );
      return undefined;
    }

    this.cache = new SQLiteCache(dbPath, this.logger);
    return this.cache;
  }

  /**
   * Start the translator
   */
  async start(context: vscode.ExtensionContext): Promise<void> {
    // Check if already running
    if (this.translatorManager) {
      vscode.window.showInformationMessage('Translator already running');
      return;
    }

    // Get workspace
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    try {
      // Initialize environment
      await initTranslatorEnv(
        ws.uri.fsPath,
        this.logger,
        this.fileSystem,
        async (path: string) => {
          const doc = await vscode.workspace.openTextDocument(path);
          await vscode.window.showTextDocument(doc);
        }
      );

      // Get cache
      this.cache = this.getCache();
      if (!this.cache) {
        return;
      }

      // Create workspace watcher
      const watcher = new VSCodeWorkspaceWatcher();

      // Create translator manager
      this.translatorManager = new TranslatorManager(
        this.fileSystem,
        this.logger,
        this.cache,
        ws.uri.fsPath,
        watcher,
        this.configProvider
      );

      // Load project configuration
      const projectConfig = await loadProjectConfig(
        ws.uri.fsPath,
        this.configProvider,
        this.logger,
        this.fileSystem
      );

      // Start watching
      await this.translatorManager.startWatching(projectConfig);

      // Show success message
      vscode.window.showInformationMessage('Translator started');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error starting translator: ${error.message || String(error)}`);

      // Cleanup on error
      if (this.translatorManager) {
        this.translatorManager.dispose();
        this.translatorManager = null;
      }

      throw error;
    }
  }

  /**
   * Stop the translator
   */
  stop(): void {
    if (!this.translatorManager) {
      vscode.window.showInformationMessage('Translator not running');
      return;
    }

    // Dispose resources
    this.translatorManager.dispose();
    this.translatorManager = null;

    vscode.window.showInformationMessage('Translator stopped');
  }

  /**
   * Restart the translator
   */
  async restart(context: vscode.ExtensionContext): Promise<void> {
    this.stop();
    await this.start(context);
  }

  /**
   * Push translations to MateCat
   */
  async pushToMateCat(): Promise<void> {
    if (!this.translatorManager) {
      vscode.window.showInformationMessage('Translator not running. Start the translator first.');
      return;
    }

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pushToMateCat();
      vscode.window.showInformationMessage('Successfully pushed translations to MateCat');
    } catch (e: any) {
      vscode.window.showErrorMessage(`MateCat push failed: ${e.message}`);
    }
  }

  /**
   * Pull translations from MateCat
   */
  async pullFromMateCat(): Promise<void> {
    if (!this.translatorManager) {
      vscode.window.showInformationMessage('Translator not running. Start the translator first.');
      return;
    }

    try {
      // Use the TranslatorManager's MateCat integration
      await this.translatorManager.pullFromMateCat();
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
    if (this.translatorManager) {
      this.translatorManager.dispose();
      this.translatorManager = null;
    }

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }

    this.subscriptions = [];
  }
}