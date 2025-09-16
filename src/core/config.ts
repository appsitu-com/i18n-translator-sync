import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { TranslatorEngine } from '../translators/types'
import { FileSystem } from './util/fs'
import { Logger } from './util/logger'

const ENGINES = ['azure', 'google', 'deepl', 'gemini', 'copy'] as const

// Define the schema for validation
const translatorEngineEnum = z.enum(ENGINES) as z.ZodType<TranslatorEngine>

// Zod schema for validating .translate.json
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

// Interface for platform-specific configuration
export interface ConfigProvider {
  /**
   * Load configuration (implementation depends on platform)
   */
  load?(): Promise<void>

  /**
   * Get configuration for a specific section
   */
  get<T>(section: string, defaultValue?: T): T

  /**
   * Update configuration for a specific section
   */
  update(section: string, value: any): Promise<void>
}

/**
 * Default configuration values
 */
export const defaultConfig: TranslateProjectConfig = {
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
 * Format Zod validation errors for better user feedback
 */
export function formatZodError(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const fieldPath = issue.path.join('.');
    const fieldName = fieldPath || 'unknown field';

    // Customize error messages based on field and error type
    switch (fieldName) {
      case 'sourceDir':
        return `Source directory: ${issue.message} (must be a string)`;
      case 'targetDir':
        return `Target directory: ${issue.message} (must be a string)`;
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
 */
export async function loadProjectConfig(
  rootPath: string,
  configProvider: ConfigProvider,
  logger: Logger,
  fileSystem?: FileSystem
): Promise<TranslateProjectConfig> {
  const configPath = path.join(rootPath, '.translate.json')
  let projectConfig: Partial<TranslateProjectConfig> = {}

  try {
    // Check if config file exists before attempting to read it
    const configExists = fileSystem
      ? await fileSystem.fileExists(fileSystem.createUri(configPath))
      : fs.existsSync(configPath)

    if (configExists) {
      // Read the config file
      const configContent = fileSystem
        ? await fileSystem.readFile(fileSystem.createUri(configPath))
        : fs.readFileSync(configPath, 'utf8')

      const parsedConfig = JSON.parse(configContent)

      // Validate the configuration
      const validationResult = TranslateConfigSchema.safeParse(parsedConfig)

      if (!validationResult.success) {
        // Format errors for better user feedback
        const errors = formatZodError(validationResult.error)

        // Show error notification
        const errorMessage = `Invalid .translate.json configuration:\n${errors.join('\n')}`
        logger.error(errorMessage)

        // Still use what we can from the config, even with errors
        projectConfig = parsedConfig
      } else {
        // Config is valid
        projectConfig = validationResult.data
      }
    }
  } catch (error: any) {
    const errorMessage = `Error loading .translate.json: ${error.message || error}`
    logger.error(errorMessage)
  }

  // Get section defaults from the configuration provider
  return {
    sourceDir: projectConfig.sourceDir || defaultConfig.sourceDir,
    targetDir: projectConfig.targetDir || defaultConfig.targetDir,
    sourcePaths: projectConfig.sourcePaths || defaultConfig.sourcePaths,
    sourceLocale: projectConfig.sourceLocale || configProvider.get<string>('translator.sourceLocale', defaultConfig.sourceLocale),
    targetLocales: projectConfig.targetLocales || configProvider.get<string[]>('translator.targetLocales', defaultConfig.targetLocales),
    enableBackTranslation: projectConfig.enableBackTranslation ?? configProvider.get<boolean>('translator.enableBackTranslation', defaultConfig.enableBackTranslation),
    defaultMarkdownEngine: projectConfig.defaultMarkdownEngine || configProvider.get<TranslatorEngine>('translator.defaultMarkdownEngine', defaultConfig.defaultMarkdownEngine),
    defaultJsonEngine: projectConfig.defaultJsonEngine || configProvider.get<TranslatorEngine>('translator.defaultJsonEngine', defaultConfig.defaultJsonEngine),
    engineOverrides: projectConfig.engineOverrides ||
      // Convert from legacy string format to string[] format
      Object.fromEntries(
        Object.entries(
          configProvider.get<Record<string, string | string[]>>('translator.engineOverrides', {})
        ).map(([engine, localesStr]) => [
          engine,
          typeof localesStr === 'string' ?
            localesStr.split(',').map(s => s.trim()) :
            Array.isArray(localesStr) ? localesStr : []
        ])
      )
  };
}