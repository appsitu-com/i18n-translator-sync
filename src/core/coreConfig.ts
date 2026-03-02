import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { TranslatorEngine } from '../translators/types'
import { FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'
import { formatZodError } from './util/formatZodError'
import { TRANSLATOR_JSON } from './constants'

const ENGINES = ['azure', 'google', 'deepl', 'gemini', 'copy'] as const

// Define the schema for validation
const translatorEngineEnum = z.enum(ENGINES) as z.ZodType<TranslatorEngine>

// Zod schema for validating translator.json
export const TranslateConfigSchema = z.object({
  sourceDir: z.string().optional().default('').describe('Base directory for source paths (prepended to sourcePaths)'),
  targetDir: z.string().optional().default('').describe('Base directory for target paths (prepended to generated target paths)'),
  sourcePaths: z.array(z.string()).describe('Source language paths to scan for files to translate'),
  sourceLocale: z.string().describe('Source locale (e.g., "en")'),
  targetLocales: z.array(z.string()).describe('Target locales to generate translations for (e.g., ["fr", "es", "de"])'),
  enableBackTranslation: z.boolean().describe('Enable back translation'),
  defaultMarkdownEngine: translatorEngineEnum.describe('Default engine for markdown files'),
  defaultJsonEngine: translatorEngineEnum.describe('Default engine for JSON files'),
  engineOverrides: z
    .record(z.string(), z.array(z.string()))
    .describe('Engine overrides for specific locales. Key is engine name, value is array of locale patterns'),
  excludeKeys: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Key names to exclude from translation (copied unchanged). Matches at any depth.'),
  excludeKeyPaths: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Exact dotted key paths to exclude from translation (e.g. "meta.version").'),
  copyOnlyFiles: z
    .array(z.string())
    .optional()
    .default([])
    .describe('File names (not paths) to copy verbatim instead of translating (e.g. "index.ts").')
})


// Infer the type from the schema - should match our interface
export type TranslateProjectConfig = z.infer<typeof TranslateConfigSchema>

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
  engineOverrides: {} as Record<string, string[]>,
  excludeKeys: [] as string[],
  excludeKeyPaths: [] as string[],
  copyOnlyFiles: [] as string[]
}

/**
 * Load project configuration from translator.json
 * @param rootPath The root path of the project
 * @param configProvider The configuration provider
 * @param logger The logger instance
 * @param fileSystem The file system instance
 * @returns The loaded project configuration
 */
export async function loadProjectConfig(
  rootPath: string,
  configProvider: ConfigProvider,
  logger: Logger,
  fileSystem?: FileSystem
): Promise<TranslateProjectConfig> {
  const configPath = path.join(rootPath, TRANSLATOR_JSON)
  let projectConfig: Partial<TranslateProjectConfig> = {}

  // Log the configuration file path being checked
  logger.info(`Checking for configuration file: ${configPath}`)

  try {
    // Check if config file exists before attempting to read it
    const configExists = fileSystem
      ? await fileSystem.fileExists(fileSystem.createUri(configPath))
      : fs.existsSync(configPath)

    if (configExists) {
      logger.info(`Loading configuration from: ${configPath}`)

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
        const errorMessage = `Invalid translator.json configuration:\n${errors.join('\n')}`
        logger.error(errorMessage)

        // Still use what we can from the config, even with errors
        projectConfig = parsedConfig
      } else {
        // Config is valid
        projectConfig = validationResult.data
      }
    }
  } catch (error: any) {
    const errorMessage = `Error loading translator.json: ${error.message || error}`
    logger.error(errorMessage)
  }

  // Get section defaults from the configuration provider
  return {
    sourceDir: projectConfig.sourceDir || defaultConfig.sourceDir,
    targetDir: projectConfig.targetDir || defaultConfig.targetDir,
    sourcePaths: projectConfig.sourcePaths || defaultConfig.sourcePaths,
    sourceLocale:
      projectConfig.sourceLocale || configProvider.get<string>('translator.sourceLocale', defaultConfig.sourceLocale),
    targetLocales:
      projectConfig.targetLocales ||
      configProvider.get<string[]>('translator.targetLocales', defaultConfig.targetLocales),
    enableBackTranslation:
      projectConfig.enableBackTranslation ??
      configProvider.get<boolean>('translator.enableBackTranslation', defaultConfig.enableBackTranslation),
    defaultMarkdownEngine:
      projectConfig.defaultMarkdownEngine ||
      configProvider.get<TranslatorEngine>('translator.defaultMarkdownEngine', defaultConfig.defaultMarkdownEngine),
    defaultJsonEngine:
      projectConfig.defaultJsonEngine ||
      configProvider.get<TranslatorEngine>('translator.defaultJsonEngine', defaultConfig.defaultJsonEngine),
    engineOverrides:
      projectConfig.engineOverrides ||
      // Convert from legacy string format to string[] format
      Object.fromEntries(
        Object.entries(configProvider.get<Record<string, string | string[]>>('translator.engineOverrides', {})).map(
          ([engine, localesStr]) => [
            engine,
            typeof localesStr === 'string'
              ? localesStr.split(',').map((s) => s.trim())
              : Array.isArray(localesStr)
              ? localesStr
              : []
          ]
        )
      ),
    // These fields are translator.json-only (no VS Code settings fallback)
    excludeKeys: projectConfig.excludeKeys ?? defaultConfig.excludeKeys,
    excludeKeyPaths: projectConfig.excludeKeyPaths ?? defaultConfig.excludeKeyPaths,
    copyOnlyFiles: projectConfig.copyOnlyFiles ?? defaultConfig.copyOnlyFiles
  }
}
