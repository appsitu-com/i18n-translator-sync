import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { VSCodeTranslatorAdapter } from './vscode/vscodeAdapter'
import { StatusBarManager, VSCodeStatusBarManager, TranslatorState } from './vscode/statusBar'
import { VSCodeLogger } from './vscode/vscodeLogger'
import { TRANSLATOR_JSON, TRANSLATOR_ENV, TRANSLATOR_DIR } from './core/constants'
import { MissingEnvironmentValueError } from './core/config'

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
  } catch {
    // If there's any error reading the file, assume it's not properly configured
    return false
  }
}

/**
 * Ensure a line exists in the workspace .gitignore file.
 * Creates the file if it doesn't exist.
 */
function ensureGitignoreEntry(workspacePath: string, entry: string): void {
  const gitignorePath = path.join(workspacePath, '.gitignore')
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8')
      if (!content.split('\n').some((line) => line.trim() === entry)) {
        fs.appendFileSync(gitignorePath, `\n${entry}\n`)
      }
    } else {
      fs.writeFileSync(gitignorePath, `${entry}\n`)
    }
  } catch (error) {
    // Non-critical — log but don't block startup
    console.warn(`Failed to update .gitignore with "${entry}": ${error}`)
  }
}

/**
 * Check for configuration files and create them from samples if they don't exist.
 * Newly created files are automatically opened in the editor.
 */
async function checkAndCreateConfigFiles(context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return // No workspace folder available
  }

  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath

  // Ensure sensitive/runtime paths are always git-ignored on start
  ensureGitignoreEntry(workspacePath, TRANSLATOR_ENV)
  ensureGitignoreEntry(workspacePath, `${TRANSLATOR_DIR}/`)

  const configFiles = [
    {
      name: TRANSLATOR_ENV,
      targetPath: path.join(workspacePath, TRANSLATOR_ENV),
      samplePath: path.join(context.extensionPath, 'samples', TRANSLATOR_ENV),
      message: 'A translator.env file has been created. Please configure your translation API keys.',
      reminderMessage: "Don't forget to configure your translation API keys in the translator.env file.",
      docsUrl: 'https://github.com/appsitu-com/i18n-translator-sync?tab=readme-ov-file#setting-api-keys',
      gitignoreEntry: null
    },
    {
      name: TRANSLATOR_JSON,
      targetPath: path.join(workspacePath, TRANSLATOR_JSON),
      samplePath: path.join(context.extensionPath, 'samples', TRANSLATOR_JSON),
      message: 'A translator.json file has been created. Please configure your translation settings.',
      reminderMessage: null, // No reminder for JSON file
      docsUrl: 'https://github.com/appsitu-com/i18n-translator-sync?tab=readme-ov-file#getting-started',
      gitignoreEntry: null
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

          // Ensure the file is listed in .gitignore (e.g. translator.env contains secrets)
          if (config.gitignoreEntry) {
            ensureGitignoreEntry(workspacePath, config.gitignoreEntry)
          }

          // Auto-open the newly created file in a pinned (non-preview) editor tab
          const doc = await vscode.workspace.openTextDocument(config.targetPath)
          await vscode.window.showTextDocument(doc, { preview: false })

          // Notify the user with documentation link
          vscode.window.showInformationMessage(config.message, 'Documentation').then((selection) => {
            if (selection === 'Documentation') {
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
    // Ensure configuration files exist before starting the server
    await checkAndCreateConfigFiles(context)

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
  } catch (error: any) {
    if (error instanceof MissingEnvironmentValueError) {
      const action = 'Set in translator.env'
      vscode.window
        .showErrorMessage(
          `Missing environment value "${error.variableName}". Set this variable in translator.env or your environment.`,
          action
        )
        .then((selection) => {
          if (
            selection === action &&
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
      return
    }

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
  // channel.appendLine('- Translator: Set Up Encryption (configure API key encryption)')
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
 * Export cache to CSV
 */
async function exportCache(): Promise<void> {
  const channel = getOutputChannel()
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const adapter = getCurrentVSCodeAdapter()
  if (!adapter) {
    vscode.window.showErrorMessage('Translator not initialized. Please start the translator first.')
    return
  }

  try {
    // Get CSV path from config
    const config = await adapter.getProjectConfig()
    const defaultPath = config.csvExportPath || 'translator.csv'
    const csvPath = path.isAbsolute(defaultPath)
      ? defaultPath
      : path.join(workspaceFolder.uri.fsPath, defaultPath)

    // Ask user for export path
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(csvPath),
      filters: { 'CSV Files': ['csv'] },
      title: 'Export translation memory to CSV'
    })

    if (!uri) {
      return
    }

    // Export
    const cache = adapter.getCacheInstance()
    if (cache) {
      await cache.exportCSV(uri.fsPath)
      vscode.window.showInformationMessage(`Cache exported to ${uri.fsPath}`)
      channel.appendLine(`Cache exported to ${uri.fsPath}`)
    } else {
      vscode.window.showErrorMessage('Cache not available')
    }
  } catch (error) {
    const msg = `Failed to export cache: ${error}`
    channel.appendLine(msg)
    vscode.window.showErrorMessage(msg)
  }
}

/**
 * Import cache from CSV
 */
async function importCache(): Promise<void> {
  const channel = getOutputChannel()
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const adapter = getCurrentVSCodeAdapter()
  if (!adapter) {
    vscode.window.showErrorMessage('Translator not initialized. Please start the translator first.')
    return
  }

  try {
    // Get CSV path from config
    const config = await adapter.getProjectConfig()
    const defaultPath = config.csvExportPath || 'translator.csv'
    const csvPath = path.isAbsolute(defaultPath)
      ? defaultPath
      : path.join(workspaceFolder.uri.fsPath, defaultPath)

    // Ask user for import path
    const uris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(csvPath),
      filters: { 'CSV Files': ['csv'] },
      title: 'Import translation memory from CSV',
      canSelectMany: false
    })

    if (!uris || uris.length === 0) {
      return
    }

    // Confirm before importing (replaces all data)
    const confirmed = await vscode.window.showWarningMessage(
      'Import will replace all existing cache data. Continue?',
      { modal: true },
      'Import'
    )

    if (confirmed !== 'Import') {
      return
    }

    // Import
    const cache = adapter.getCacheInstance()
    if (cache) {
      const count = await cache.importCSV(uris[0].fsPath)
      vscode.window.showInformationMessage(`Imported ${count} translations from ${uris[0].fsPath}`)
      channel.appendLine(`Imported ${count} translations from ${uris[0].fsPath}`)
    } else {
      vscode.window.showErrorMessage('Cache not available')
    }
  } catch (error) {
    const msg = `Failed to import cache: ${error}`
    channel.appendLine(msg)
    vscode.window.showErrorMessage(msg)
  }
}

/**
 * Purge unused translations from cache
 */
async function purgeCache(): Promise<void> {
  const channel = getOutputChannel()
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const adapter = getCurrentVSCodeAdapter()
  if (!adapter) {
    vscode.window.showErrorMessage('Translator not initialized. Please start the translator first.')
    return
  }

  try {
    const confirmed = await vscode.window.showWarningMessage(
      'Purge will delete all unused translations. A CSV backup will be created first when available. Continue?',
      { modal: true },
      'Purge'
    )

    if (confirmed !== 'Purge') {
      return
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Purging unused translations...',
        cancellable: false
      },
      async () => {
        const result = await adapter.purge()
        const details = result.backupPath ? ` Backup: ${result.backupPath}` : ''
        const message = `Purged ${result.deletedCount} unused translations.${details}`
        channel.appendLine(message)
        vscode.window.showInformationMessage(message)
      }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('not initialized')) {
      const msg = 'To perform a Purge, run "Translator: Start" command first'
      channel.appendLine(msg)
      vscode.window.showWarningMessage(msg)
    } else {
      const msg = `Failed to purge cache: ${error}`
      channel.appendLine(msg)
      vscode.window.showErrorMessage(msg)
    }
  }
}

/**
 * Extended QuickPickItem with command field
 */
interface CommandQuickPickItem extends vscode.QuickPickItem {
  command?: string
}

/**
 * Show context menu with all available translator commands
 * Icons: https://microsoft.github.io/vscode-codicons/dist/codicon.html
 */
export async function showContextMenu(context: vscode.ExtensionContext): Promise<void> {
  const state = getTranslatorState()

  // Create menu items based on current state
  const items: CommandQuickPickItem[] = []

  if (state.isRunning) {
    items.push(
      {
        label: '$(debug-pause) Stop Translator',
        description: 'Stop file watching and auto-translation',
        command: 'translator.stop'
      },
      {
        label: '$(refresh) Restart Translator',
        description: 'Restart file watching with fresh configuration',
        command: 'translator.restart'
      }
    )
  } else if (state.isInitialized) {
    items.push(
      {
        label: '$(play-circle) Start Translator',
        description: 'Start file watching and auto-translation',
        command: 'translator.start'
      },
      {
        label: '$(refresh) Restart Translator',
        description: 'Restart file watching with fresh configuration',
        command: 'translator.restart'
      }
    )
  } else {
    items.push({
      label: '$(play-circle) Start Translator',
      description: 'Initialize and start file watching',
      command: 'translator.start'
    })
  }

  // Always available commands
  items.push(
    // {
    //   label: '$(cloud-upload) Push to MateCat',
    //   description: 'Upload source files to MateCat for professional translation',
    //   command: 'translator.push'
    // },
    // {
    //   label: '$(cloud-download) Pull from MateCat',
    //   description: 'Download completed translations from MateCat',
    //   command: 'translator.pull'
    // },
    {
      label: '$(arrow-circle-right) Export Translation Memory to CSV',
      description: 'Export TM database to CSV file',
      command: 'translator.exportCache'
    },
    {
      label: '$(arrow-circle-left) Import Translation Memory from CSV',
      description: 'Import TM database from CSV file',
      command: 'translator.importCache'
    },
    {
      label: '$(trash) Purge Unused Translations',
      description: 'Remove translations not used by current source files',
      command: 'translator.purgeCache'
    },
    {
      label: '$(output) Show Output',
      description: 'Open the translator output channel',
      command: 'translator.showOutput'
    }
  )

  // Extract command map from command fields and remove commands for display
  const commandMap = new Map(items.map(item => [item.label, item.command || '']))
  items.forEach(item => delete item.command)

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a translator command',
    title: 'i18n Translator Commands'
  })

  if (selected) {
    const command = commandMap.get(selected.label)
    if (command) {
      // Execute the selected command
      await vscode.commands.executeCommand(command, context)
    }
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
  channel.appendLine(`i18n Translator Sync v${version} (built ${buildDate})`)
  channel.appendLine(`Activation time: ${new Date().toISOString()}`)
  channel.appendLine(`Extension path: ${context.extensionPath}`)
  channel.appendLine('To see this output, run the command "Translator: Show Output"')

  // Show the output channel during development
  if (process.env.VSCODE_DEBUG_MODE === '1' || process.env.NODE_ENV === 'development') {
    channel.show()
  }

  // Register commands early so they are always available, even if initialization is slow.
  context.subscriptions.push(
    vscode.commands.registerCommand('translator.start', async () => onStartTranslator(context)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(context)),
    // vscode.commands.registerCommand('translator.push', async () => pushToMateCat()),
    // vscode.commands.registerCommand('translator.pull', async () => pullFromMateCat()),
    vscode.commands.registerCommand('translator.showOutput', () => onShowOutput()),
    vscode.commands.registerCommand('translator.showContextMenu', async () => showContextMenu(context)),
    vscode.commands.registerCommand('translator.exportCache', async () => exportCache()),
    vscode.commands.registerCommand('translator.importCache', async () => importCache()),
    vscode.commands.registerCommand('translator.purgeCache', async () => purgeCache())
  )

  // Run initialization in the background so extension activation never blocks.
  void (async () => {
    try {
      await vsCodeAdapter.initializeOnActivation()
      updateStatusBar()
    } catch (error) {
      console.error(`i18n Translator Sync: Failed to initialize translator during activation: ${error}`)
      // Don't fail activation if initialization fails - commands can still try to initialize
      channel.appendLine(`Warning: i18n Translator Sync: Failed to initialize translator during activation: ${error}`)
      channel.appendLine('Commands will attempt to initialize when needed')
      updateStatusBar()
    }

    // Auto-start runs in the same background task to avoid blocking activation.
    const autoStartSetting = vscode.workspace.getConfiguration('translator').get<string>('autoStart', 'ask')
    if (autoStartSetting === 'true') {
      try {
        await onStartTranslator(context)
      } catch (error) {
        console.error(`i18n Translator Sync: Auto-start failed: ${error}`)
        channel.appendLine(`Warning: i18n Translator Sync: Auto-start failed: ${error}`)
      }
    }
  })()

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
