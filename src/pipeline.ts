import * as vscode from 'vscode'
import * as path from 'path'
import type { TranslationCache } from './cache.sqlite'
import { extractForFile, jsonPathToString } from './extractors/index'
import { loadContextCsvForJson } from './contextCsv'
import { bulkTranslateWithEngine } from './bulkTranslate'
import { pickEngine } from './translators/registry'
import { resolveEnvDeep } from './core/util/env'
import { createEngineOverrides } from './core/util/engines'
import { generateContextCsvWarnings } from './core/util/contextCsvWarnings'
import { TranslatorApiConfig, TranslatorEngine } from './translators/types'
import { loadProjectConfig, verifyFilePath } from './config'
import { getRelativePath, createTargetUri, createBackTranslationUri, findSourcePathForFile, containsLocale } from './util/paths'
import { VSCodeLogger } from './vscode/logger'

/**
 * Validate workspace folder and return its path
 */
function validateWorkspace(ws: vscode.WorkspaceFolder | undefined): vscode.WorkspaceFolder {
  if (!ws || !ws.uri) {
    throw new Error(`Invalid or missing workspace folder`)
  }
  return ws
}

/**
 * Get relative path from source directory to the file
 */
function getSourceRelativePath(uri: vscode.Uri): string {
  const ws = validateWorkspace(vscode.workspace.getWorkspaceFolder(uri))
  const config = loadProjectConfig(ws)

  try {
    return getRelativePath(uri, config)
  } catch (error) {
    // Run verification checks for detailed diagnostics
    verifyFilePath(uri)

    // Re-throw with more detailed error message
    throw error
  }
}

/**
 * Create URI for translated output file
 */
function outUri(ws: vscode.WorkspaceFolder, locale: string, rel: string): vscode.Uri {
  validateWorkspace(ws)
  const config = loadProjectConfig(ws)

  // For backward compatibility, we need to determine the source path
  // Since this old interface doesn't have srcUri, we'll try to find the best match
  const sourcePath = config.sourcePaths.find(sp => containsLocale(sp, config.sourceLocale)) || config.sourcePaths[0] || 'i18n/en'

  return createTargetUri(ws, config.sourceLocale, locale, rel, config, sourcePath)
}

/**
 * Create URI for back-translation output file
 */
function backOutUri(ws: vscode.WorkspaceFolder, locale: string, rel: string, srcUri?: vscode.Uri): vscode.Uri {
  validateWorkspace(ws)
  const config = loadProjectConfig(ws)

  // Get source path if srcUri is provided
  const sourcePath = srcUri ? findSourcePathForFile(srcUri, config) : undefined

  return createBackTranslationUri(ws, locale, rel, config, sourcePath || undefined)
}
/**
 * Ensure directory exists for a file
 */
async function ensureDirFor(file: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, '..'))
  } catch (error) {
    console.error(`Failed to create directory for ${file.fsPath}: ${error}`)
    throw error
  }
}

/**
 * Write text content to a file, ensuring its directory exists
 */
async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await ensureDirFor(uri)
  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  } catch (error) {
    console.error(`Failed to write file ${uri.fsPath}: ${error}`)
    throw error
  }
}

/**
 * Clean up empty directories after file deletion
 */
export async function pruneEmptyDirs(root: vscode.Uri, relPath: string): Promise<void> {
  const parts = relPath.split('/')
  parts.pop() // Remove the file name

  while (parts.length) {
    const dir = vscode.Uri.joinPath(root, ...parts)
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir)
      if (entries.length) break // Directory not empty, stop pruning
      await vscode.workspace.fs.delete(dir, { recursive: false })
      parts.pop() // Move up to parent directory
    } catch {
      break // Stop if error occurs (likely directory doesn't exist)
    }
  }
}

/**
 * Get engine configuration for the given engine name
 */
function getEngineConfig(engineName: TranslatorEngine): TranslatorApiConfig {
  const settings = vscode.workspace.getConfiguration('translator')
  const rawConfig = settings.get(engineName)

  if (!rawConfig) {
    throw new Error(`Missing configuration for translation engine '${engineName}'`)
  }

  // Resolve environment variables in configuration
  const outputChannel = vscode.window.createOutputChannel('Pipeline Config');
  const logger = new VSCodeLogger(outputChannel);
  return resolveEnvDeep(rawConfig, logger) as TranslatorApiConfig
}

/**
 * Handle context CSV loading for JSON files
 */
async function loadJsonContexts(extraction: any, srcUri: vscode.Uri): Promise<(string | null)[]> {
  // Default to null contexts
  let contexts: (string | null)[] = new Array(extraction.segments.length).fill(null)

  if (extraction.kind !== 'json' && extraction.kind !== 'yaml') {
    return contexts
  }

  const { map: ctxMap, stats } = await loadContextCsvForJson(srcUri)
  const validPaths = new Set(extraction.paths.map(jsonPathToString))

  // Generate context CSV warning messages
  const msgs = generateContextCsvWarnings(ctxMap, validPaths, stats)

  if (msgs.length) {
    vscode.window.showWarningMessage(
      `Translator context CSV issues in ${stats.fileUri?.fsPath || ''}: ${msgs.join(' | ')}`
    )
  }

  return extraction.makeContexts(ctxMap)
}

/**
 * Translate segments using specified engine
 */
async function translateSegments(
  segments: string[],
  contexts: (string | null)[],
  engineName: TranslatorEngine,
  sourceLocale: string,
  targetLocale: string,
  cache: TranslationCache
): Promise<string[]> {
  // If using copy engine, just return original segments
  if (engineName === 'copy') {
    return segments.slice()
  }

  // Get engine configuration and translate
  const apiConfig = getEngineConfig(engineName)
  return await bulkTranslateWithEngine(
    segments,
    contexts,
    engineName,
    {
      source: sourceLocale,
      target: targetLocale,
      apiConfig
    },
    cache
  )
}

/**
 * Process file for all target locales
 */
export async function processFileForLocales(
  srcUri: vscode.Uri,
  cache: TranslationCache,
  params?: Partial<{ sourceLocale: string; targetLocales: string[]; enableBackTranslation: boolean }>
) {
  const ws = validateWorkspace(vscode.workspace.getWorkspaceFolder(srcUri))

  // Load project configuration
  const projectConfig = loadProjectConfig(ws)

  // Use provided params or fall back to project config
  const sourceLocale = params?.sourceLocale ?? projectConfig.sourceLocale
  const targetLocales = params?.targetLocales ?? projectConfig.targetLocales
  const enableBackTranslation = params?.enableBackTranslation ?? projectConfig.enableBackTranslation

  // Get relative path from the source folder
  const rel = getSourceRelativePath(srcUri)
  console.log(`File ${srcUri.fsPath} resolved to relative path: ${rel}`)

  // Read and process file content
  const filename = srcUri.fsPath.replace(/\\/g, '/').toLowerCase()
  const content = (await vscode.workspace.fs.readFile(srcUri)).toString()
  const extraction = extractForFile(filename, content)

  // Determine file type
  const isMarkdown = filename.endsWith('.md') || filename.endsWith('.mdx') || filename.endsWith('.markdown')
  const _isYaml = filename.endsWith('.yml') || filename.endsWith('.yaml')
  // YAML files use the same translator as JSON

  // Get engine configuration
  const defaults = {
    md: projectConfig.defaultMarkdownEngine,
    json: projectConfig.defaultJsonEngine
  }

  // Create engine overrides mapping
  const overrides = createEngineOverrides(projectConfig.engineOverrides)

  // Load translation contexts for JSON files
  const contexts = await loadJsonContexts(extraction, srcUri)

  // Process each target locale
  for (const targetLocale of targetLocales) {
    // Forward translation (source to target)
    const engineName = pickEngine({
      source: sourceLocale,
      target: targetLocale,
      defaults,
      overrides,
      fileType: isMarkdown ? 'md' : 'json'
    })

    // Translate the segments
    const fwd = await translateSegments(extraction.segments, contexts, engineName, sourceLocale, targetLocale, cache)

    // Write forward translation output
    await writeText(outUri(ws, targetLocale, rel), extraction.rebuild(fwd))

    // Handle back translation if enabled
    if (enableBackTranslation) {
      const backEngine = pickEngine({
        source: targetLocale,
        target: sourceLocale,
        defaults,
        overrides,
        fileType: isMarkdown ? 'md' : 'json'
      })

      // If using copy engine for forward translation, just copy the segments again
      const back =
        engineName === 'copy'
          ? fwd.slice()
          : await translateSegments(fwd, contexts, backEngine, targetLocale, sourceLocale, cache)

      // Write back translation output
      await writeText(backOutUri(ws, targetLocale, rel, srcUri), extraction.rebuild(back))
    }
  }
}

/**
 * Remove translated files for a source file
 */
export async function removeFileForLocales(srcUri: vscode.Uri, locales?: string[]) {
  const ws = validateWorkspace(vscode.workspace.getWorkspaceFolder(srcUri))
  const config = loadProjectConfig(ws)

  // Use provided locales or fall back to project config
  const targetLocales = locales || config.targetLocales

  // Get relative path from source
  const rel = getSourceRelativePath(srcUri)

  for (const locale of targetLocales) {
    // Get URIs for forward and back translation files
    const fwd = outUri(ws, locale, rel)
    const bwd = backOutUri(ws, locale, rel, srcUri)

    // Delete translation files
    try {
      await vscode.workspace.fs.delete(fwd, { recursive: false, useTrash: false })
    } catch (error) {
      // Ignore errors if file doesn't exist
      console.log(`Could not delete ${fwd.fsPath}: ${error}`)
    }

    try {
      await vscode.workspace.fs.delete(bwd, { recursive: false, useTrash: false })
    } catch (error) {
      // Ignore errors if file doesn't exist
      console.log(`Could not delete ${bwd.fsPath}: ${error}`)
    }

    // Clean up empty directories
    if (config.targetDir) {
      // If using custom target directory
      const targetBasePath = path.join(ws.uri.fsPath, config.targetDir)
      await pruneEmptyDirs(vscode.Uri.file(path.join(targetBasePath, 'i18n', locale)), rel)
      await pruneEmptyDirs(vscode.Uri.file(path.join(targetBasePath, 'i18n', `${locale}_en`)), rel)
    } else {
      // Default cleanup paths
      await pruneEmptyDirs(vscode.Uri.joinPath(ws.uri, 'i18n', locale), rel)
      await pruneEmptyDirs(vscode.Uri.joinPath(ws.uri, 'i18n', `${locale}_en`), rel)
    }
  }
}
