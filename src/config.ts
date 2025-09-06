import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { TranslatorEngine } from './translators/types'

/**
 * Project configuration stored in .translate.json
 */
export interface TranslateProjectConfig {
  /**
   * Source language paths to scan for files to translate
   */
  sourcePaths: string[]
  /**
   * Source locale (default: 'en')
   */
  sourceLocale: string
  /**
   * Target locales to generate translations for
   */
  targetLocales: string[]
  /**
   * Enable back translation (default: false)
   */
  enableBackTranslation: boolean
  /**
   * Default engine for markdown files
   */
  defaultMarkdownEngine: TranslatorEngine
  /**
   * Default engine for JSON files
   */
  defaultJsonEngine: TranslatorEngine
  /**
   * Engine overrides for specific locales
   * Key is the engine name, value is an array of locale patterns
   */
  engineOverrides: Record<string, string[]>
}

/**
 * Default configuration values
 */
const defaultConfig: TranslateProjectConfig = {
  sourcePaths: ['i18n/en'],
  sourceLocale: 'en',
  targetLocales: [],
  enableBackTranslation: false,
  defaultMarkdownEngine: 'azure',
  defaultJsonEngine: 'google',
  engineOverrides: {} as Record<string, string[]>
}

/**
 * Load project configuration from .translate.json
 * Falls back to VSCode settings for backward compatibility
 */
export function loadProjectConfig(workspaceFolder: vscode.WorkspaceFolder): TranslateProjectConfig {
  const configPath = path.join(workspaceFolder.uri.fsPath, '.translate.json')
  let projectConfig: Partial<TranslateProjectConfig> = {}

  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8')
      projectConfig = JSON.parse(configContent) as Partial<TranslateProjectConfig>
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error loading .translate.json: ${error}`)
  }

  // Fall back to VSCode settings for backward compatibility
  const settings = vscode.workspace.getConfiguration('translator')

  return {
    sourcePaths: projectConfig.sourcePaths || defaultConfig.sourcePaths,
    sourceLocale: projectConfig.sourceLocale || settings.get<string>('sourceLocale', defaultConfig.sourceLocale),
    targetLocales: projectConfig.targetLocales || settings.get<string[]>('targetLocales', defaultConfig.targetLocales),
    enableBackTranslation: projectConfig.enableBackTranslation ?? settings.get<boolean>('enableBackTranslation', defaultConfig.enableBackTranslation),
    defaultMarkdownEngine: projectConfig.defaultMarkdownEngine || settings.get<TranslatorEngine>('defaultMarkdownEngine', defaultConfig.defaultMarkdownEngine),
    defaultJsonEngine: projectConfig.defaultJsonEngine || settings.get<TranslatorEngine>('defaultJsonEngine', defaultConfig.defaultJsonEngine),
    engineOverrides: projectConfig.engineOverrides ||
      // Convert from legacy string format to string[] format
      Object.fromEntries(
        Object.entries(
          settings.get<Record<string, string>>('engineOverrides', {})
        ).map(([engine, localesStr]) => [
          engine,
          localesStr.split(',').map(s => s.trim())
        ])
      )
  }
}

/**
 * Find the source path that contains the given file
 */
export function findSourcePathForFile(uri: vscode.Uri, config: TranslateProjectConfig): string | null {
  const ws = vscode.workspace.getWorkspaceFolder(uri)
  if (!ws) return null

  // Handle both fsPath and path properties to work with tests
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    console.log(`Workspace has no path: ${JSON.stringify(ws.uri)}`)
    return null;
  }

  const uriPath = uri.fsPath || uri.path;
  if (!uriPath) {
    console.log(`URI has no path: ${JSON.stringify(uri)}`)
    return null;
  }

  // Normalize paths for consistent comparison (especially important on Windows)
  const normalizedUriPath = uriPath.replace(/\\/g, '/').toLowerCase()
  console.log(`Finding source path for: ${normalizedUriPath}`)

  for (const sourcePath of config.sourcePaths) {
    // Normalize the full source path
    const fullSourcePath = path.join(wsPath, sourcePath).replace(/\\/g, '/').toLowerCase()
    console.log(`Checking if file is in: ${fullSourcePath}`)

    if (normalizedUriPath.startsWith(fullSourcePath)) {
      console.log(`Match found: ${sourcePath}`)
      return sourcePath
    }
  }

  // For debugging
  console.log(`No source path found for ${uriPath}. Checked paths:`,
    config.sourcePaths.map(p => path.join(wsPath, p).replace(/\\/g, '/')))

  return null
}

/**
 * Utility function to verify if a file is in any of the configured source paths
 * Can be called from other modules for debugging
 */
export function verifyFilePath(uri: vscode.Uri): void {
  const ws = vscode.workspace.getWorkspaceFolder(uri)
  if (!ws) {
    console.log(`No workspace found for ${uri.fsPath || uri.path}`)
    return
  }

  // Handle both fsPath and path properties to work with tests
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    console.log(`Workspace has no path: ${JSON.stringify(ws.uri)}`)
    return;
  }

  const uriPath = uri.fsPath || uri.path;
  if (!uriPath) {
    console.log(`URI has no path: ${JSON.stringify(uri)}`)
    return;
  }

  const config = loadProjectConfig(ws)
  const normalizedUriPath = uriPath.replace(/\\/g, '/').toLowerCase()

  console.log(`Verification for file: ${uriPath}`)
  console.log(`Normalized path: ${normalizedUriPath}`)
  console.log(`Workspace path: ${wsPath}`)
  console.log(`Source paths:`, config.sourcePaths)

  for (const sourcePath of config.sourcePaths) {
    const fullSourcePath = path.join(wsPath, sourcePath).replace(/\\/g, '/').toLowerCase()
    console.log(`Checking path ${sourcePath}: ${fullSourcePath}`)
    console.log(`Is file in path? ${normalizedUriPath.startsWith(fullSourcePath)}`)
  }
}
