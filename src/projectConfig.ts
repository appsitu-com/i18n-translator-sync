import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { z } from 'zod'
import { TranslatorEngine } from './translators/types'
import { formatZodError } from './core/util/configUtils'
import { containsLocale, replaceLocaleInPath, findSourcePathForFile, verifyFilePath as pathsVerifyFilePath } from './util/translationPaths'

const ENGINES = ['azure', 'google', 'deepl', 'gemini', 'copy'] as const

// Define the schema for validation
const translatorEngineEnum = z.enum(ENGINES) as z.ZodType<TranslatorEngine>

// Zod schema for validating .translator.json
export const TranslateConfigSchema = z.object({
  sourceDir: z.string()
    .describe('Base directory for source paths (prepended to sourcePaths)')
    .optional(),

  targetDir: z.string()
    .describe('Base directory for target paths (prepended to generated target paths)')
    .optional(),

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
  sourceDir: string
  targetDir: string
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
  sourceDir: '',
  targetDir: '',
  sourcePaths: ['i18n/en'],
  sourceLocale: 'en',
  targetLocales: [],
  enableBackTranslation: false,
  defaultMarkdownEngine: 'azure',
  defaultJsonEngine: 'google',
  engineOverrides: {} as Record<string, string[]>
}

/**
 * Load project configuration from .translator.json
 * Falls back to VSCode settings for backward compatibility
 */
export function loadProjectConfig(workspaceFolder: vscode.WorkspaceFolder): TranslateProjectConfig {
  const configPath = path.join(workspaceFolder.uri.fsPath, '.translator.json')
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
        const errorMessage = `Invalid .translator.json configuration:\n${errors.join('\n')}`
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
    const errorMessage = `Error loading .translator.json: ${error.message || error}`
    vscode.window.showErrorMessage(errorMessage)
    console.error(errorMessage)
  }

  // Fall back to VSCode settings for backward compatibility
  const settings = vscode.workspace.getConfiguration('translator')

  return {
    sourceDir: projectConfig.sourceDir || defaultConfig.sourceDir,
    targetDir: projectConfig.targetDir || defaultConfig.targetDir,
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

// Re-export path utilities from the paths module
export { containsLocale, replaceLocaleInPath, findSourcePathForFile }

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

  const config = loadProjectConfig(ws)

  // Use the imported verification function from paths.ts
  pathsVerifyFilePath(uri, config)
}