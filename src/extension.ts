import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { VSCodeTranslatorAdapter } from './vscode/adapter'

// Exported for testing
export let outputChannel: vscode.OutputChannel
export let vsCodeAdapter: VSCodeTranslatorAdapter | null = null

/**
 * Get or create the singleton output channel
 */
function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('i18n Translator');
  }
  return outputChannel;
}

/**
 * Get or create the singleton VSCode adapter
 */
function getVSCodeAdapter(): VSCodeTranslatorAdapter {
  if (!vsCodeAdapter) {
    vsCodeAdapter = new VSCodeTranslatorAdapter(getOutputChannel());
  }
  return vsCodeAdapter;
}

/**
 * Start the translator with auto-start prompt
 */
export async function onStartTranslator(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Get the singleton adapter
    const adapter = getVSCodeAdapter();
    await adapter.startWithContext(context);

    // When manually started, ask if user wants to enable auto-start
    const response = await vscode.window.showInformationMessage(
      'Do you want to automatically start the translator whenever you open this workspace?',
      'Yes',
      'No'
    )

    if (response === 'Yes') {
      await vscode.workspace.getConfiguration('translator').update('autoStart', true, vscode.ConfigurationTarget.Workspace);
    }

    // Also inform about API keys
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const envFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.translator.env')
      if (fs.existsSync(envFile)) {
        vscode.window
          .showInformationMessage(
            "Don't forget to configure your translation API keys in the .translator.env file.",
            'Open File',
            'Documentation'
          )
          .then((selection) => {
            if (selection === 'Open File') {
              vscode.workspace.openTextDocument(envFile).then((doc) => {
                vscode.window.showTextDocument(doc)
              })
            } else if (selection === 'Documentation') {
              vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/tohagan/vscode-i18n-translator-ext#api-keys')
              )
            }
          })
      }
    }
  } catch (error: any) {
    // Show error and offer to open env file
    vscode.window
      .showErrorMessage(`Error starting translator: ${error?.message || String(error)}`, 'Configure API Keys')
      .then((selection) => {
        if (
          selection === 'Configure API Keys' &&
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders.length > 0
        ) {
          const envFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.translator.env')
          if (fs.existsSync(envFile)) {
            vscode.workspace.openTextDocument(envFile).then((doc) => {
              vscode.window.showTextDocument(doc)
            })
          }
        }
      })
  }
}

/**
 * Stop the translator
 */
export function stopTranslator(): void {
  const adapter = getVSCodeAdapter();
  adapter.stop();
}

/**
 * Restart the translator
 */
export async function restartTranslator(context: vscode.ExtensionContext): Promise<void> {
  const adapter = getVSCodeAdapter();
  await adapter.restartWithContext(context);
}

/**
 * Push translations to MateCat
 */
export async function pushToMateCat(): Promise<void> {
  const adapter = getVSCodeAdapter();
  await adapter.pushToMateCat();
}

/**
 * Pull translations from MateCat
 */
export async function pullFromMateCat(): Promise<void> {
  const adapter = getVSCodeAdapter();
  await adapter.pullFromMateCat();
}

/**
 * Show the output channel
 */
export function onShowOutput(): void {
  const adapter = getVSCodeAdapter();
  adapter.showOutput();
}

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Get or create output channel
  const channel = getOutputChannel();
  context.subscriptions.push(channel);

  // Create the adapter with shared output channel
  vsCodeAdapter = new VSCodeTranslatorAdapter(channel);

  // Log activation
  channel.appendLine('i18n Translator extension activated');
  channel.appendLine(`Activation time: ${new Date().toISOString()}`);
  channel.appendLine('To see this output, run the command "Translator: Show Output"');

  // Show the output channel during development
  if (process.env.VSCODE_DEBUG_MODE === '1' || process.env.NODE_ENV === 'development') {
    channel.show();
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('translator.start', async () => onStartTranslator(context)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(context)),
    vscode.commands.registerCommand('translator.push', async () => pushToMateCat()),
    vscode.commands.registerCommand('translator.pull', async () => pullFromMateCat()),
    vscode.commands.registerCommand('translator.showOutput', () => onShowOutput())
  );

  // Check if auto-start is enabled for this workspace
  const autoStart = vscode.workspace.getConfiguration('translator').get<boolean>('autoStart', false);
  if (autoStart) {
    await onStartTranslator(context);
  } else {
    // Show a status bar item that allows starting the translator
    // Check if we're in a real VS Code environment first (not in tests)
    if (typeof vscode.window.createStatusBarItem === 'function') {
      try {
        // Skip creating status bar item in test environments
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
          statusBarItem.text = '$(globe) Start Translator';
          statusBarItem.tooltip = 'Start the i18n translator';
          statusBarItem.command = 'translator.start';
          statusBarItem.show();
          context.subscriptions.push(statusBarItem);
        }
      } catch (error) {
        console.warn('Could not create status bar item:', error);
      }
    }
  }
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  if (vsCodeAdapter) {
    vsCodeAdapter.dispose();
    vsCodeAdapter = null;
  }
}
