import * as vscode from 'vscode'
import * as path from 'path'
import type { TranslationCache } from './cache.sqlite'
import { extractForFile, jsonPathToString } from './extractor'
import { loadContextCsvForJson } from './contextCsv'
import { bulkTranslateWithEngine } from './bulkTranslate'
import { pickEngine } from './translators/registry'
import { resolveEnvDeep } from './util/env'
import { TranslatorApiConfig, TranslatorEngine } from './translators/types'

const SRC_ROOT = 'i18n/en'

function relFromEN(uri: vscode.Uri) {
  const ws = vscode.workspace.getWorkspaceFolder(uri)!
  return path.relative(path.join(ws.uri.fsPath, SRC_ROOT), uri.fsPath)
}
function outUri(ws: vscode.WorkspaceFolder, locale: string, rel: string) {
  return vscode.Uri.joinPath(ws.uri, 'i18n', locale, rel)
}
function backOutUri(ws: vscode.WorkspaceFolder, locale: string, rel: string) {
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
  params: { locales: string[]; sourceLocale: string; enableBackTranslation: boolean },
  cache: TranslationCache
) {
  const ws = vscode.workspace.getWorkspaceFolder(srcUri)!
  const rel = relFromEN(srcUri)
  const filename = srcUri.fsPath.replace(/\\/g, '/').toLowerCase()
  const content = (await vscode.workspace.fs.readFile(srcUri)).toString()

  const extraction = extractForFile(filename, content)
  const isMarkdown = filename.endsWith('.md') || filename.endsWith('.mdx') || filename.endsWith('.markdown')

  const settings = vscode.workspace.getConfiguration('translator')
  const defaults = {
    md: settings.get<string>('defaultMarkdownEngine', 'azure'),
    json: settings.get<string>('defaultJsonEngine', 'google')
  }

  // overrides the default translation engine for specific locales
  const overrideCfg = settings.get<Record<string, string>>('engineOverrides', {})

  const overrides: Record<string, string> = Object.fromEntries(
    Object.entries(overrideCfg).flatMap(([engine, locales]) =>
      locales.split(',').map(locale => locale.trim()).map((locale) =>
        locale.match(/:/)
          ? [locale, engine] // locale is actually fromLocale:toLocale
          : [
              [`en:${locale}`, engine],
              [`${locale}:en`, engine]
            ]
      )
    )
  )

  const rawCfgFor = (engine: TranslatorEngine) => settings.get(engine)
  const cfgFor = (engine: TranslatorEngine) => {
    if (engine === 'copy') return { engine: 'copy' } satisfies TranslatorApiConfig
    const cfg = rawCfgFor(engine)
    if (!cfg) throw new Error(`Missing configuration for translation engine '${engine}'`)
    // TODO: Verify resolved type
    return { engine, ...resolveEnvDeep(cfg) } as TranslatorApiConfig // may throw MissingEnvVarError
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

  for (const targetLocale of params.locales) {
    // source => target translation
    const engineName = pickEngine({
      source: params.sourceLocale,
      target: targetLocale,
      defaults,
      overrides,
      isMarkdown
    })

    const apiConfig = cfgFor(engineName)

    const fwd = await bulkTranslateWithEngine(
      extraction.segments,
      contexts,
      engineName,
      { source: params.sourceLocale, target: targetLocale, apiConfig },
      cache
    )

    await writeText(outUri(ws, targetLocale, rel), extraction.rebuild(fwd))

    // target => source translation
    if (params.enableBackTranslation) {
      const backEngine = pickEngine({
        source: targetLocale,
        target: params.sourceLocale,
        defaults,
        overrides,
        isMarkdown
      })

      const backCfg = cfgFor(backEngine)

      const back = await bulkTranslateWithEngine(
        fwd,
        contexts,
        backEngine,
        { source: targetLocale, target: params.sourceLocale, apiConfig: backCfg },
        cache
      )

      await writeText(backOutUri(ws, targetLocale, rel), extraction.rebuild(back))
    }
  }
}

export async function removeFileForLocales(srcUri: vscode.Uri, locales: string[]) {
  const ws = vscode.workspace.getWorkspaceFolder(srcUri)!
  const rel = relFromEN(srcUri)
  for (const locale of locales) {
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
