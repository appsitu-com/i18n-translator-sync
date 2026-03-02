import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { VSCodeTranslatorAdapter } from './vscode/vscodeAdapter'
import { StatusBarManager, VSCodeStatusBarManager, TranslatorState } from './vscode/statusBar'
import { VSCodeLogger } from './vscode/vscodeLogger'
import { TRANSLATOR_JSON, TRANSLATOR_ENV } from './core/constants'

// Exported for testing
export let outputChannel: vscode.OutputChannel
export let vsCodeAdapter: VSCodeTranslatorAdapter | null = null
export let statusBarManager: StatusBarManager | null = null

/**
 * Get or create the singleton output channel
 */
function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('i18n Translator')
  }
  return outputChannel
}

/**
 * Get the current VSCode adapter instance (without creating a new one)
 */
function getCurrentVSCodeAdapter(): VSCodeTranslatorAdapter | null {
  return vsCodeAdapter
}

/**
 * Get or create the singleton VSCode adapter
 */
function getVSCodeAdapter(): VSCodeTranslatorAdapter {
  if (!vsCodeAdapter) {
    const channel = getOutputChannel()
    const logger = new VSCodeLogger(channel)

    vsCodeAdapter = new VSCodeTranslatorAdapter(logger)
  }
  return vsCodeAdapter
}

/**
 * Get the current translator state
 */
function getTranslatorState(): TranslatorState {
  if (!vsCodeAdapter) {
    return { isRunning: false, isInitialized: false }
  }

  const status = vsCodeAdapter.getStatus()
  return {
    isRunning: status.running,
    isInitialized: status.initialized
  }
}

/**
 * Update the status bar to reflect the current translator state
 */
function updateStatusBar(): void {
  if (statusBarManager) {
    const state = getTranslatorState()
    statusBarManager.updateStatus(state)
  }
}

/**
 * Check if the translator.env file is properly configured with actual API keys
 * Returns true if the file has at least one non-empty, non-placeholder API key
 */
function isEnvFileConfigured(envFilePath: string): boolean {
  try {
    if (!fs.existsSync(envFilePath)) {
      return false
    }

    const content = fs.readFileSync(envFilePath, 'utf-8')

    // Skip empty files or files that only have comments/whitespace
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      return trimmed && !trimmed.startsWith('#')
    })

    if (lines.length === 0) {
      return false
    }

    // Check if any line has a real API key (not a placeholder like TEST_API_KEY=abcdef123456)
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=')
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')

      // Skip if no key or value
      if (!key?.trim() || !value) {
        continue
      }

      // Skip obvious placeholders (the sample key, or values that are too short)
      if (value === 'abcdef123456' || value.length < 8) {
        continue
      }

      // Found a real API key - file is configured
      return true
    }

    return false
  } catch (error) {
    // If there's any error reading the file, assume it's not properly configured
    return false
  }
}

/**
 * Check for configuration files and create them from samples if they don't exist
 */
function checkAndCreateConfigFiles(context: vscode.ExtensionContext): void {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return // No workspace folder available
  }

  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath
  const configFiles = [
    {
      name: TRANSLATOR_ENV,
      targetPath: path.join(workspacePath, TRANSLATOR_ENV),
      samplePath: path.join(context.extensionPath, 'samples', TRANSLATOR_ENV),
      message: 'A translator.env file has been created. Please configure your translation API keys.',
      reminderMessage: "Don't forget to configure your translation API keys in the translator.env file.",
      docsUrl: 'https://github.com/tohagan/vscode-i18n-translator-ext#api-keys'
    },
    {
      name: TRANSLATOR_JSON,
      targetPath: path.join(workspacePath, TRANSLATOR_JSON),
      samplePath: path.join(context.extensionPath, 'samples', TRANSLATOR_JSON),
      message: 'A translator.json file has been created. Please configure your translation settings.',
      reminderMessage: null, // No reminder for JSON file
      docsUrl: 'https://github.com/tohagan/vscode-i18n-translator-ext#configuration'
    }
  ]

  for (const config of configFiles) {
    // Check if the file exists
    if (!fs.existsSync(config.targetPath)) {
      // Check if the sample exists
      if (fs.existsSync(config.samplePath)) {
        try {
          // Copy the sample to create the target file
          fs.copyFileSync(config.samplePath, config.targetPath)

          // Notify the user
          vscode.window.showInformationMessage(config.message, 'Open File', 'Documentation').then((selection) => {
            if (selection === 'Open File') {
              vscode.workspace.openTextDocument(config.targetPath).then((doc) => {
                vscode.window.showTextDocument(doc)
              })
            } else if (selection === 'Documentation') {
              vscode.env.openExternal(vscode.Uri.parse(config.docsUrl))
            }
          })
        } catch (error) {
          vscode.window.showWarningMessage(`Failed to create ${config.name} file: ${error}`)
        }
      }
    } else if (config.reminderMessage) {
      // If file already exists and we have a reminder message, only show it if not properly configured
      const isConfigured = isEnvFileConfigured(config.targetPath)
      if (!isConfigured) {
        vscode.window.showInformationMessage(config.reminderMessage, 'Open File', 'Documentation').then((selection) => {
          if (selection === 'Open File') {
            vscode.workspace.openTextDocument(config.targetPath).then((doc) => {
              vscode.window.showTextDocument(doc)
            })
          } else if (selection === 'Documentation') {
            vscode.env.openExternal(vscode.Uri.parse(config.docsUrl))
          }
        })
      }
    }
  }
}

/**
 * Start the translator with auto-start prompt
 */
export async function onStartTranslator(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Get the singleton adapter
    const adapter = getVSCodeAdapter()
    await adapter.startWithContext(context)

    // Update status bar to reflect running state
    updateStatusBar()

    // When manually started, check if we need to ask about auto-start
    const autoStartSetting = vscode.workspace.getConfiguration('translator').get<string>('autoStart', 'ask')

    // Only prompt if the setting is still 'ask'
    if (autoStartSetting === 'ask') {
      const response = await vscode.window.showInformationMessage(
        'Do you want to automatically start the translator whenever you open this workspace?',
        'Yes',
        'No'
      )

      const autoStart = response === 'Yes' ? 'true' : 'false'
      await vscode.workspace
        .getConfiguration('translator')
        .update('autoStart', autoStart, vscode.ConfigurationTarget.Workspace)
    }

    // Check and create configuration files if needed
    checkAndCreateConfigFiles(context)
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
          const envFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, TRANSLATOR_ENV)
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
  // Use existing adapter (don't create a new one)
  const adapter = getCurrentVSCodeAdapter()
  if (adapter) {
    adapter.stop()
    // Update status bar to reflect stopped state
    updateStatusBar()
  } else {
    vscode.window.showWarningMessage('Translator extension not activated. Please reload the window.')
  }
}

/**
 * Restart the translator
 */
export async function restartTranslator(context: vscode.ExtensionContext): Promise<void> {
  // Use existing adapter or get the singleton (this will be the same instance created during activation)
  const adapter = getCurrentVSCodeAdapter()
  if (adapter) {
    await adapter.restartWithContext(context)
    // Update status bar to reflect running state
    updateStatusBar()
  } else {
    vscode.window.showWarningMessage('Translator extension not activated. Please reload the window.')
  }
}

/**
 * Push translations to MateCat
 */
export async function pushToMateCat(): Promise<void> {
  // Use existing adapter or get the singleton (this will be the same instance created during activation)
  const adapter = getCurrentVSCodeAdapter()
  if (adapter) {
    await adapter.pushToMateCat()
  } else {
    vscode.window.showWarningMessage('Translator extension not activated. Please reload the window.')
  }
}

/**
 * Pull translations from MateCat
 */
export async function pullFromMateCat(): Promise<void> {
  // Use existing adapter or get the singleton (this will be the same instance created during activation)
  const adapter = getCurrentVSCodeAdapter()
  if (adapter) {
    await adapter.pullFromMateCat()
  } else {
    vscode.window.showWarningMessage('Translator extension not activated. Please reload the window.')
  }
}

/**
 * Show the output channel
 */
export function onShowOutput(): void {
  const adapter = getCurrentVSCodeAdapter()
  const channel = getOutputChannel()

  channel.appendLine(`Output channel shown at: ${new Date().toISOString()}`)
  channel.appendLine('Available commands:')
  channel.appendLine('- Translator: Start (starts file watching and auto-translation)')
  channel.appendLine('- Translator: Stop (stops file watching)')
  channel.appendLine('- Translator: Restart (restart watching)')
  // channel.appendLine('- Translator: Push to MateCat (works without starting)')
  // channel.appendLine('- Translator: Pull from MateCat (works without starting)')
  channel.appendLine('- Translator: Set Up Encryption (configure API key encryption)')
  channel.appendLine('- Translator: Show Output (this command)')
  channel.appendLine('')

  if (adapter) {
    if (adapter.isRunning()) {
      channel.appendLine('Status: Translator is currently RUNNING (watching for file changes)')
    } else {
      channel.appendLine('Status: Translator is STOPPED (not watching for file changes)')
    }
  } else {
    channel.appendLine('Status: Extension not yet activated')
  }

  channel.show()
}

/**
 * Show context menu with all available translator commands
 */
export async function showContextMenu(context: vscode.ExtensionContext): Promise<void> {
  const state = getTranslatorState()

  // Create menu items based on current state
  const items: vscode.QuickPickItem[] = []

  if (state.isRunning) {
    items.push(
      {
        label: '$(debug-pause) Stop Translator',
        description: 'Stop file watching and auto-translation',
        detail: 'translator.stop'
      },
      {
        label: '$(refresh) Restart Translator',
        description: 'Restart file watching with fresh configuration',
        detail: 'translator.restart'
      }
    )
  } else if (state.isInitialized) {
    items.push(
      {
        label: '$(play-circle) Start Translator',
        description: 'Start file watching and auto-translation',
        detail: 'translator.start'
      },
      {
        label: '$(refresh) Restart Translator',
        description: 'Restart file watching with fresh configuration',
        detail: 'translator.restart'
      }
    )
  } else {
    items.push({
      label: '$(play-circle) Start Translator',
      description: 'Initialize and start file watching',
      detail: 'translator.start'
    })
  }

  // Always available commands
  items.push(
    // {
    //   label: '$(cloud-upload) Push to MateCat',
    //   description: 'Upload source files to MateCat for professional translation',
    //   detail: 'translator.push'
    // },
    // {
    //   label: '$(cloud-download) Pull from MateCat',
    //   description: 'Download completed translations from MateCat',
    //   detail: 'translator.pull'
    // },
    {
      label: '$(output) Show Output',
      description: 'Open the translator output channel',
      detail: 'translator.showOutput'
    }
  )

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a translator command',
    title: 'i18n Translator Commands'
  })

  if (selected && selected.detail) {
    // Execute the selected command
    await vscode.commands.executeCommand(selected.detail, context)
  }
}

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Get or create output channel
  const channel = getOutputChannel()
  context.subscriptions.push(channel)

  // Create logger bound to the output channel
  const logger = new VSCodeLogger(channel)

  // Create the adapter with shared output channel
  vsCodeAdapter = new VSCodeTranslatorAdapter(logger)

  // Create the status bar manager
  statusBarManager = new VSCodeStatusBarManager(context)
  statusBarManager.create()

  // Log activation with version and build info
  const ext = context.extension
  const version = ext.packageJSON?.version ?? 'unknown'
  let buildDate = 'unknown'
  try {
    const buildInfoPath = path.join(context.extensionPath, 'dist', 'buildInfo.json')
    if (fs.existsSync(buildInfoPath)) {
      const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'))
      buildDate = buildInfo.buildDate ?? 'unknown'
    }
  } catch {
    // ignore - buildInfo.json may not exist in dev
  }
  channel.appendLine(`i18n Translator v${version} (built ${buildDate})`)
  channel.appendLine(`Activation time: ${new Date().toISOString()}`)
  channel.appendLine(`Extension path: ${context.extensionPath}`)
  channel.appendLine('To see this output, run the command "Translator: Show Output"')

  // Show the output channel during development
  if (process.env.VSCODE_DEBUG_MODE === '1' || process.env.NODE_ENV === 'development') {
    channel.show()
  }

  // Initialize the adapter during activation so commands can work
  try {
    await vsCodeAdapter.initializeOnActivation()
    // Update status bar after initialization
    updateStatusBar()
  } catch (error) {
    // Don't fail activation if initialization fails - commands can still try to initialize
    channel.appendLine(`Warning: Failed to initialize translator during activation: ${error}`)
    channel.appendLine('Commands will attempt to initialize when needed')
    // Still update status bar to show uninitialized state
    updateStatusBar()
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('translator.start', async () => onStartTranslator(context)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(context)),
    // vscode.commands.registerCommand('translator.push', async () => pushToMateCat()),
    // vscode.commands.registerCommand('translator.pull', async () => pullFromMateCat()),
    vscode.commands.registerCommand('translator.showOutput', () => onShowOutput()),
    vscode.commands.registerCommand('translator.showContextMenu', async () => showContextMenu(context))
  )

  // Check if auto-start is enabled for this workspace
  const autoStartSetting = vscode.workspace.getConfiguration('translator').get<string>('autoStart', 'ask')
  if (autoStartSetting === 'true') {
    await onStartTranslator(context)
  }

  // Status bar is already created and will be updated by the commands
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  if (statusBarManager) {
    statusBarManager.dispose()
    statusBarManager = null
  }

  if (vsCodeAdapter) {
    vsCodeAdapter.dispose()
    vsCodeAdapter = null
  }
}
