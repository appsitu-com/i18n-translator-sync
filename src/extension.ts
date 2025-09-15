import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { existsSync } from 'fs'
import { SQLiteCache } from './cache.sqlite'
import { processFileForLocales, removeFileForLocales } from './pipeline'
import { registerAllTranslators } from './translators'
import { pullReviewedFromMateCat, pushCacheToMateCat } from './matecate'
import { loadProjectConfig } from './config'
import { initTranslatorEnv } from './util/env'

// Exported for testing
export let cache: SQLiteCache | undefined = undefined
export let watchers: vscode.FileSystemWatcher[] = []
export let subscriptions: vscode.Disposable[] = []

function cfg() {
  return vscode.workspace.getConfiguration('translator')
}

function getCache(dbMustExist = false): SQLiteCache | undefined {
  const ws = vscode.workspace.workspaceFolders?.[0]
  if (!ws) {
    vscode.window.showInformationMessage(`VSCode workspace is not opened`)
    return undefined
  }
  const dbPath = path.join(ws.uri.fsPath, '.i18n-cache', 'translation.db')
  if (dbMustExist && !existsSync(dbPath)) {
    vscode.window.showInformationMessage(`${dbPath}: Translation cache not found. Start the translator to create it.`)
    return undefined
  }
  return new SQLiteCache(dbPath)
}

export async function onStartTranslator(ctx: vscode.ExtensionContext): Promise<void> {
  // Check if API keys are configured before starting
  try {
    // Try to start the translator
    await startTranslator(ctx)

    // When manually started, ask if user wants to enable auto-start
    const response = await vscode.window.showInformationMessage(
      'Do you want to automatically start the translator whenever you open this workspace?',
      'Yes',
      'No'
    )

    if (response === 'Yes') {
      await cfg().update('autoStart', true, vscode.ConfigurationTarget.Workspace)
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

export async function startTranslator(ctx: vscode.ExtensionContext) {
  if (watchers.length > 0) {
    vscode.window.showInformationMessage('Translator already running')
    return
  }

  // Initialize the environment when starting translator
  initTranslatorEnv()

  cache = getCache()

  // Get the workspace
  const ws = vscode.workspace.workspaceFolders?.[0]
  if (!ws) {
    vscode.window.showErrorMessage('No workspace folder found')
    return
  }

  // Load project configuration
  const projectConfig = loadProjectConfig(ws)

  // Create watchers for each source path
  console.log(`Setting up watchers for paths: ${JSON.stringify(projectConfig.sourcePaths)}`)

  for (const sourcePath of projectConfig.sourcePaths) {
    // Create the glob pattern ensuring it works on all platforms
    const normalizedPath = sourcePath.replace(/\\/g, '/')
    const pattern = `**/${normalizedPath}/**`
    console.log(`Creating watcher with pattern: ${pattern}`)

    const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false)
    watchers.push(watcher)
    console.log(`Watcher created for ${pattern}`)
  }

  if (watchers.length === 0) {
    vscode.window.showWarningMessage('No source paths configured for translation monitoring')
  }

  const onAddOrChange = async (uri: vscode.Uri) => {
    try {
      console.log(`File changed: ${uri.fsPath}`)

      if (!cache) {
        console.log('No translation cache available')
        return
      }

      const ws = vscode.workspace.getWorkspaceFolder(uri)
      if (!ws) {
        console.log('No workspace found for file')
        return
      }

      // Get project configuration (which may come from .translate.json)
      const projectConfig = loadProjectConfig(ws)
      console.log(`Config loaded with source paths: ${JSON.stringify(projectConfig.sourcePaths)}`)

      // Check if we have any target locales
      if (!projectConfig.targetLocales.length) {
        console.log('No target locales configured')
        return
      }

      // Process the file using project configuration
      console.log(`Processing file: ${uri.fsPath}`)
      await processFileForLocales(uri, cache)
      console.log(`Successfully processed file: ${uri.fsPath}`)
    } catch (err: any) {
      console.error(`Error processing file ${uri.fsPath}:`, err)
      vscode.window.showErrorMessage(`Translator error for ${uri.fsPath}: ${err?.message ?? String(err)}`)
    }
  }

  const onDelete = async (uri: vscode.Uri) => {
    try {
      await removeFileForLocales(uri)
    } catch (err: any) {
      vscode.window.showErrorMessage(`Translator error (delete) for ${uri.fsPath}: ${err?.message ?? String(err)}`)
    }
  }

  const onRename = async (e: vscode.FileRenameEvent) => {
    if (!cache) return

    for (const file of e.files) {
      try {
        const oldPath = file.oldUri.fsPath.replace(/\\/g, '/')
        const newPath = file.newUri.fsPath.replace(/\\/g, '/')

        const ws = vscode.workspace.getWorkspaceFolder(file.newUri)
        if (!ws) continue

        const projectConfig = loadProjectConfig(ws)

        // Check if the file is within any source path
        let isInSourcePath = false
        for (const sourcePath of projectConfig.sourcePaths) {
          const fullSourcePath = path.join(ws.uri.fsPath, sourcePath).replace(/\\/g, '/')
          if (oldPath.startsWith(fullSourcePath) || newPath.startsWith(fullSourcePath)) {
            isInSourcePath = true
            break
          }
        }

        if (isInSourcePath) {
          if (file.oldUri) {
            await removeFileForLocales(file.oldUri)
          }
          if (file.newUri) {
            await processFileForLocales(file.newUri, cache)
          }
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Translator error (rename) for ${file.newUri.fsPath}: ${err?.message ?? String(err)}`
        )
      }
    }
  }

  subscriptions = [
    ...watchers.flatMap((watcher) => [
      watcher.onDidCreate(onAddOrChange),
      watcher.onDidChange(onAddOrChange),
      watcher.onDidDelete(onDelete),
      watcher
    ]),
    vscode.workspace.onDidRenameFiles(onRename)
  ]
  ctx.subscriptions.push(...subscriptions)
  vscode.window.showInformationMessage('Translator started')
}

export function stopTranslator() {
  if (subscriptions.length > 0) {
    subscriptions.forEach((s) => {
      console.log('Disposing subscription', typeof s.dispose)
      s.dispose()
    })
    subscriptions = []
  }

  if (watchers.length > 0) {
    watchers = []
    cache?.close()
    cache = undefined
    vscode.window.showInformationMessage('Translator stopped')
  } else {
    vscode.window.showInformationMessage('Translator not running')
  }
}

export async function restartTranslator(ctx: vscode.ExtensionContext) {
  stopTranslator()
  await startTranslator(ctx)
}

export async function pushToMateCat(): Promise<void> {
  try {
    const cache = getCache()
    if (cache) await pushCacheToMateCat(cache)
  } catch (e: any) {
    vscode.window.showErrorMessage(`MateCat push failed: ${e.message}`)
  }
}

export async function pullFromMateCat(): Promise<void> {
  try {
    const cache = getCache(true)
    if (cache) await pullReviewedFromMateCat(cache)
  } catch (e: any) {
    vscode.window.showErrorMessage(`MateCat pull failed: ${e.message}`)
  }
}

export async function activate(ctx: vscode.ExtensionContext) {
  // Only register translators - don't initialize environment yet
  registerAllTranslators()

  // Register commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('translator.start', async () => onStartTranslator(ctx)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(ctx)),
    vscode.commands.registerCommand('translator.push', async () => pushToMateCat()),
    vscode.commands.registerCommand('translator.pull', async () => pullFromMateCat())
  )

  // Check if auto-start is enabled for this workspace
  const autoStart = cfg().get<boolean>('autoStart', false)
  if (autoStart) {
    await onStartTranslator(ctx)
  } else {
    // Show a status bar item that allows starting the translator
    // Check if we're in a real VS Code environment first (not in tests)
    if (typeof vscode.window.createStatusBarItem === 'function') {
      try {
        // Skip creating status bar item in test environments
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
          statusBarItem.text = '$(globe) Start Translator'
          statusBarItem.tooltip = 'Start the i18n translator'
          statusBarItem.command = 'translator.start'
          statusBarItem.show()
          ctx.subscriptions.push(statusBarItem)
        }
      } catch (error) {
        console.warn('Could not create status bar item:', error)
      }
    }
  }
}

export function deactivate() {
  stopTranslator()
}
