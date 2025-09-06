import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { z } from 'zod'
import { TranslatorEngine } from './translators/types'

const ENGINES = ['azure', 'google', 'deepl', 'gemini', 'copy'] as const

// Define the schema for validation
const translatorEngineEnum = z.enum(ENGINES) as z.ZodType<TranslatorEngine>

// Zod schema for validating .translate.json
export const TranslateConfigSchema = z.object({
  sourcePaths: z.array(z.string())
    .describe('Source language paths to scan for files to translate')
    .optional(),

  sourceLocale: z.string()
    .describe('Source locale (e.g., "en")')
    .optional(),

  targetLocales: z.array(z.string())
    .describe('Target locales to generate translations for (e.g., ["fr", "es", "de"])')
    .optional(),

  enableBackTranslation: z.boolean()
    .describe('Enable back translation')
    .optional(),

  defaultMarkdownEngine: translatorEngineEnum
    .describe('Default engine for markdown files')
    .optional(),

  defaultJsonEngine: translatorEngineEnum
    .describe('Default engine for JSON files')
    .optional(),

  engineOverrides: z.record(z.string(), z.array(z.string()))
    .describe('Engine overrides for specific locales. Key is engine name, value is array of locale patterns')
    .optional()
});

// Infer the type from the schema - should match our interface
export type TranslateProjectConfig = z.infer<typeof TranslateConfigSchema> & {
  sourcePaths: string[]
  sourceLocale: string
  targetLocales: string[]
  enableBackTranslation: boolean
  defaultMarkdownEngine: TranslatorEngine
  defaultJsonEngine: TranslatorEngine
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
 * Format Zod validation errors for better user feedback
 */
function formatZodError(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const fieldPath = issue.path.join('.');
    const fieldName = fieldPath || 'unknown field';

    // Customize error messages based on field and error type
    switch (fieldName) {
      case 'sourcePaths':
        return `Source paths: ${issue.message} (must be an array of strings)`;
      case 'sourceLocale':
        return `Source locale: ${issue.message} (must be a string like "en")`;
      case 'targetLocales':
        return `Target locales: ${issue.message} (must be an array of strings)`;
      case 'defaultMarkdownEngine':
      case 'defaultJsonEngine':
        return `${fieldName}: ${issue.message} (must be one of: ${ENGINES.join(', ')})`;
      case 'engineOverrides':
        return `Engine overrides: ${issue.message} (must be a record with string array values)`;
      default:
        return `${fieldName}: ${issue.message}`;
    }
  });
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
      const parsedConfig = JSON.parse(configContent)

      // Validate the configuration
      const validationResult = TranslateConfigSchema.safeParse(parsedConfig)

      if (!validationResult.success) {
        // Format errors for better user feedback
        const errors = formatZodError(validationResult.error)

        // Show error notification
        const errorMessage = `Invalid .translate.json configuration:\n${errors.join('\n')}`
        vscode.window.showErrorMessage(errorMessage)
        console.error(errorMessage)

        // Still use what we can from the config, even with errors
        projectConfig = parsedConfig
      } else {
        // Config is valid
        projectConfig = validationResult.data
      }
    }
  } catch (error: any) {
    const errorMessage = `Error loading .translate.json: ${error.message || error}`
    vscode.window.showErrorMessage(errorMessage)
    console.error(errorMessage)
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
          settings.get<Record<string, string | string[]>>('engineOverrides', {})
        ).map(([engine, localesStr]) => [
          engine,
          typeof localesStr === 'string' ?
            localesStr.split(',').map(s => s.trim()) :
            Array.isArray(localesStr) ? localesStr : []
        ])
      )
  };
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
