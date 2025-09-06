import * as vscode from 'vscode'
import * as path from 'path'
import type { TranslationCache } from './cache.sqlite'
import { extractForFile, jsonPathToString } from './extractors/index'
import { loadContextCsvForJson } from './contextCsv'
import { bulkTranslateWithEngine } from './bulkTranslate'
import { pickEngine } from './translators/registry'
import { resolveEnvDeep } from './util/env'
import { TranslatorApiConfig, TranslatorEngine } from './translators/types'
import { loadProjectConfig, findSourcePathForFile } from './config'

function relFromEN(uri: vscode.Uri) {
  const ws = vscode.workspace.getWorkspaceFolder(uri)!
  if (!ws || !ws.uri) {
    throw new Error(`No workspace folder found for ${uri.fsPath}`);
  }

  // Ensure we have fsPath property
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    throw new Error(`Workspace folder URI has no path: ${JSON.stringify(ws.uri)}`);
  }

  const config = loadProjectConfig(ws)

  // Find which source path this file is in
  const sourcePath = findSourcePathForFile(uri, config)
  if (!sourcePath) {
    // Import the verification function to get detailed debugging info
    const { verifyFilePath } = require('./config');

    // Run verification checks for detailed diagnostics
    verifyFilePath(uri);

    // Provide more detailed error with available paths
    const availablePaths = config.sourcePaths.map(p => path.join(wsPath, p).replace(/\\/g, '/'));
    const normalizedFilePath = uri.fsPath.replace(/\\/g, '/');

    throw new Error(
      `File ${uri.fsPath} is not in any of the configured source paths.\n` +
      `Available paths: ${JSON.stringify(availablePaths)}\n` +
      `Normalized file path: ${normalizedFilePath}\n` +
      `Workspace root: ${wsPath}`
    );
  }

  // Get relative path from source root
  const sourceFolderPath = path.join(wsPath, sourcePath);
  return path.relative(sourceFolderPath, uri.fsPath);
}
function outUri(ws: vscode.WorkspaceFolder, locale: string, rel: string) {
  if (!ws || !ws.uri) {
    throw new Error(`Invalid workspace folder for output URI: ${JSON.stringify(ws)}`);
  }
  return vscode.Uri.joinPath(ws.uri, 'i18n', locale, rel)
}
function backOutUri(ws: vscode.WorkspaceFolder, locale: string, rel: string) {
  if (!ws || !ws.uri) {
    throw new Error(`Invalid workspace folder for back-translation URI: ${JSON.stringify(ws)}`);
  }
  return vscode.Uri.joinPath(ws.uri, 'i18n', `${locale}_en`, rel)
}
async function ensureDirFor(file: vscode.Uri) {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, '..'))
}
async function writeText(uri: vscode.Uri, text: string) {
  await ensureDirFor(uri)
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
}
async function pruneEmptyDirs(root: vscode.Uri, relPath: string) {
  const parts = relPath.split('/')
  parts.pop()
  while (parts.length) {
    const dir = vscode.Uri.joinPath(root, ...parts)
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir)
      if (entries.length) break
      await vscode.workspace.fs.delete(dir, { recursive: false })
      parts.pop()
    } catch {
      break
    }
  }
}

export async function processFileForLocales(
  srcUri: vscode.Uri,
  cache: TranslationCache,
  params?: Partial<{ sourceLocale: string; targetLocales: string[]; enableBackTranslation: boolean }>
) {
  const ws = vscode.workspace.getWorkspaceFolder(srcUri)!

  // Load project configuration
  const projectConfig = loadProjectConfig(ws)

  // Use provided params or fall back to project config
  const sourceLocale = params?.sourceLocale ?? projectConfig.sourceLocale
  const targetLocales = params?.targetLocales ?? projectConfig.targetLocales
  const enableBackTranslation = params?.enableBackTranslation ?? projectConfig.enableBackTranslation

  // Get relative path from the source folder
  const rel = relFromEN(srcUri)
  console.log(`File ${srcUri.fsPath} resolved to relative path: ${rel}`)

  const filename = srcUri.fsPath.replace(/\\/g, '/').toLowerCase()
  const content = (await vscode.workspace.fs.readFile(srcUri)).toString()

  const extraction = extractForFile(filename, content)
  const isMarkdown = filename.endsWith('.md') || filename.endsWith('.mdx') || filename.endsWith('.markdown')

  const defaults = {
    md: projectConfig.defaultMarkdownEngine,
    json: projectConfig.defaultJsonEngine
  }

  // overrides the default translation engine for specific locales
  const overrideCfg = projectConfig.engineOverrides

  const overrides: Record<string, string> = Object.fromEntries(
    Object.entries(overrideCfg).flatMap(([engine, localePatterns]) =>
      localePatterns.flatMap(localePattern => {
        const locale = localePattern.trim();
        return locale.match(/:/)
          ? [[locale, engine]] // locale is actually fromLocale:toLocale
          : [
              [`en:${locale}`, engine],
              [`${locale}:en`, engine]
            ]
      })
    )
  )

  // Get translator configuration from VSCode settings (for backward compatibility)
  // In the future, this could be moved to the .translate.json file as well
  const settings = vscode.workspace.getConfiguration('translator')
  const rawCfgFor = (engine: TranslatorEngine) => settings.get(engine)
  const cfgFor = (engine: TranslatorEngine) => {
    const cfg = rawCfgFor(engine)
    if (!cfg) throw new Error(`Missing configuration for translation engine '${engine}'`)
    // TODO: Verify resolved type
    return resolveEnvDeep(cfg) as TranslatorApiConfig // may throw MissingEnvVarError
  }

  let contexts: (string | null)[] = new Array(extraction.segments.length).fill(null)
  if (extraction.kind === 'json') {
    const { map: ctxMap, stats } = await loadContextCsvForJson(srcUri)
    const validPaths = new Set(extraction.paths.map(jsonPathToString))
    const unknown = Object.keys(ctxMap).filter((k) => !validPaths.has(k))
    const msgs = []
    if (unknown.length)
      msgs.push(`Unknown context path(s): ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? ' …' : ''}`)
    if (stats.duplicates.length)
      msgs.push(
        `Duplicate path(s): ${stats.duplicates.slice(0, 6).join(', ')}${stats.duplicates.length > 6 ? ' …' : ''}`
      )
    if (stats.emptyValues.length)
      msgs.push(
        `Empty context value(s): ${stats.emptyValues.slice(0, 6).join(', ')}${stats.emptyValues.length > 6 ? ' …' : ''}`
      )
    if (msgs.length)
      vscode.window.showWarningMessage(
        `Translator context CSV issues in ${stats.fileUri?.fsPath || ''}: ${msgs.join(' | ')}`
      )
    contexts = extraction.makeContexts(ctxMap)
  }

  for (const targetLocale of targetLocales) {

    // source => target Forward translation
    const engineName = pickEngine({
      source: sourceLocale,
      target: targetLocale,
      defaults,
      overrides,
      isMarkdown
    })

    const fwd =
      engineName == 'copy'
        ? extraction.segments.slice()
        : await bulkTranslateWithEngine(
            extraction.segments,
            contexts,
            engineName,
            { source: sourceLocale, target: targetLocale, apiConfig: cfgFor(engineName) },
            cache
          )
    await writeText(outUri(ws, targetLocale, rel), extraction.rebuild(fwd))

    // target => source Back translation
    if (enableBackTranslation) {
      const backEngine = pickEngine({
        source: targetLocale,
        target: sourceLocale,
        defaults,
        overrides,
        isMarkdown
      })

      const back =
        engineName == 'copy'
          ? fwd.slice()
          : await bulkTranslateWithEngine(
              fwd,
              contexts,
              backEngine,
              {
                source: targetLocale,
                target: sourceLocale,
                apiConfig: cfgFor(backEngine)
              },
              cache
            )

      await writeText(backOutUri(ws, targetLocale, rel), extraction.rebuild(back))
    }
  }
}

export async function removeFileForLocales(srcUri: vscode.Uri, locales?: string[]) {
  const ws = vscode.workspace.getWorkspaceFolder(srcUri)!
  const projectConfig = loadProjectConfig(ws)

  // Use provided locales or fall back to project config
  const targetLocales = locales || projectConfig.targetLocales

  const rel = relFromEN(srcUri)
  for (const locale of targetLocales) {
    const fwd = outUri(ws, locale, rel)
    const bwd = backOutUri(ws, locale, rel)
    try {
      await vscode.workspace.fs.delete(fwd, { recursive: false, useTrash: false })
    } catch {}
    try {
      await vscode.workspace.fs.delete(bwd, { recursive: false, useTrash: false })
    } catch {}
    await pruneEmptyDirs(vscode.Uri.joinPath(ws.uri, 'i18n', locale), rel)
    await pruneEmptyDirs(vscode.Uri.joinPath(ws.uri, 'i18n', `${locale}_en`), rel)
  }
}
