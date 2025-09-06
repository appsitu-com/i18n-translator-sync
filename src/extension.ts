import * as vscode from 'vscode'
import * as path from 'path'
import { existsSync } from 'fs'
import { SQLiteCache } from './cache.sqlite'
import { processFileForLocales, removeFileForLocales } from './pipeline'
import { registerAllTranslators } from './translators'
import { pullReviewedFromMateCat, pushCacheToMateCat } from './matecate'
import { loadProjectConfig } from './config'
let cache: SQLiteCache | undefined = undefined
let watcher: vscode.FileSystemWatcher | null = null
let subscriptions: vscode.Disposable[] = []

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

async function startTranslator(ctx: vscode.ExtensionContext) {
  if (watcher) {
    vscode.window.showInformationMessage('Translator already running')
    return
  }

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
  const watchers: vscode.FileSystemWatcher[] = []
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

  // Assign the first watcher as the main one (for backwards compatibility)
  watcher = watchers[0] || null

  if (!watcher) {
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
        vscode.window.showErrorMessage(`Translator error (rename) for ${file.newUri.fsPath}: ${err?.message ?? String(err)}`)
      }
    }
  }

  subscriptions = [
    ...watchers.flatMap(watcher => [
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

function stopTranslator() {
  if (watcher) {
    subscriptions.forEach((s) => s.dispose())
    subscriptions = []
    watcher = null
    cache?.close()
    cache = undefined
    vscode.window.showInformationMessage('Translator stopped')
  } else {
    vscode.window.showInformationMessage('Translator not running')
  }
}

async function restartTranslator(ctx: vscode.ExtensionContext) {
  stopTranslator()
  await startTranslator(ctx)
}

async function pushToMateCat(): Promise<void> {
  try {
    const cache = getCache()
    if (cache) await pushCacheToMateCat(cache)
  } catch (e: any) {
    vscode.window.showErrorMessage(`MateCat push failed: ${e.message}`)
  }
}

async function pullFromMateCat(): Promise<void> {
  try {
    const cache = getCache(true)
    if (cache) await pullReviewedFromMateCat(cache)
  } catch (e: any) {
    vscode.window.showErrorMessage(`MateCat pull failed: ${e.message}`)
  }
}

export async function activate(ctx: vscode.ExtensionContext) {
  registerAllTranslators()
  ctx.subscriptions.push(
    vscode.commands.registerCommand('translator.start', () => startTranslator(ctx)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(ctx)),
    vscode.commands.registerCommand('translator.push', async () => pushToMateCat()),
    vscode.commands.registerCommand('translator.pull', async () => pullFromMateCat())
  )
  await startTranslator(ctx)
}

export function deactivate() {
  stopTranslator()
}
