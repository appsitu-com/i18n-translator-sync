import * as vscode from 'vscode'
import * as path from 'path'
import { SQLiteCache } from './cache.sqlite'
import { processFileForLocales, removeFileForLocales } from './pipeline'
import { registerAllTranslators } from './translators'

const SRC_ROOT = 'i18n/en'
let cache: SQLiteCache | null = null
let watcher: vscode.FileSystemWatcher | null = null
let subscriptions: vscode.Disposable[] = []

function cfg() {
  return vscode.workspace.getConfiguration('translator')
}

async function startTranslator(ctx: vscode.ExtensionContext) {
  if (watcher) {
    vscode.window.showInformationMessage('Translator already running')
    return
  }
  const ws = vscode.workspace.workspaceFolders?.[0]
  if (!ws) return
  const dbPath = path.posix.join(ws.uri.fsPath, '.i18n-cache', 'translation.db')
  cache = new SQLiteCache(dbPath)

  watcher = vscode.workspace.createFileSystemWatcher(`**/${SRC_ROOT}/**`, false, false, false)

  const onAddOrChange = async (uri: vscode.Uri) => {
    try {
      const locales = cfg().get<string[]>('targetLocales', [])
      if (!locales.length || !cache) return
      await processFileForLocales(
        uri,
        {
          locales,
          sourceLocale: cfg().get<string>('sourceLocale', 'en'),
          enableBackTranslation: cfg().get<boolean>('enableBackTranslation', true)
        },
        cache
      )
    } catch (err: any) {
      vscode.window.showErrorMessage(`Translator error for ${uri.fsPath}: ${err?.message ?? String(err)}`)
    }
  }
  const onDelete = async (uri: vscode.Uri) => {
    try {
      const locales = cfg().get<string[]>('targetLocales', [])
      if (!locales.length) return
      await removeFileForLocales(uri, locales)
    } catch (err: any) {
      vscode.window.showErrorMessage(`Translator error (delete) for ${uri.fsPath}: ${err?.message ?? String(err)}`)
    }
  }
  const onRename = async (e: vscode.FileRenameEvent) => {
    const locales = cfg().get<string[]>('targetLocales', [])
    if (!locales.length || !cache) return
    for (const f of e.files) {
      const oldPath = f.oldUri.fsPath.replace(/\\/g, '/')
      const newPath = f.newUri.fsPath.replace(/\\/g, '/')
      if (oldPath.includes('/i18n/en/')) await removeFileForLocales(f.oldUri, locales)
      if (newPath.includes('/i18n/en/'))
        await processFileForLocales(
          f.newUri,
          {
            locales,
            sourceLocale: cfg().get<string>('sourceLocale', 'en'),
            enableBackTranslation: cfg().get<boolean>('enableBackTranslation', true)
          },
          cache
        )
    }
  }

  subscriptions = [
    watcher.onDidCreate(onAddOrChange),
    watcher.onDidChange(onAddOrChange),
    watcher.onDidDelete(onDelete),
    vscode.workspace.onDidRenameFiles(onRename),
    watcher
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
    cache = null
    vscode.window.showInformationMessage('Translator stopped')
  } else {
    vscode.window.showInformationMessage('Translator not running')
  }
}

async function restartTranslator(ctx: vscode.ExtensionContext) {
  stopTranslator()
  await startTranslator(ctx)
}

export async function activate(ctx: vscode.ExtensionContext) {
  registerAllTranslators()
  ctx.subscriptions.push(
    vscode.commands.registerCommand('translator.start', () => startTranslator(ctx)),
    vscode.commands.registerCommand('translator.stop', () => stopTranslator()),
    vscode.commands.registerCommand('translator.restart', () => restartTranslator(ctx))
  )
  await startTranslator(ctx)
}

export function deactivate() {
  stopTranslator()
}
