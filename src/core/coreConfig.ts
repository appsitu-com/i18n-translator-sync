import {
  TranslatorConfigSchema,
  type ITranslatorConfig,
  type TranslatorEngine
} from './config'
import { loadTranslatorConfig, type GetPassphrase } from './config'
import { FileSystem } from './util/fs'
import { Logger } from './util/baseLogger'

// ---------------------------------------------------------------------------
// TranslateProjectConfig — the project-level subset of ITranslatorConfig
// (everything except the nested `translator` engine credentials block)
// ---------------------------------------------------------------------------

/**
 * Zod schema for the project-level config fields.
 * Derived from the canonical TranslatorConfigSchema by omitting `translator`.
 */
export const TranslateConfigSchema = TranslatorConfigSchema.omit({ translator: true })

/** Project-level configuration (no engine credentials). */
export type TranslateProjectConfig = Omit<ITranslatorConfig, 'translator'>

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
 * Default project configuration values, derived from the Zod schema defaults.
 */
export const defaultConfig: TranslateProjectConfig =
  TranslateConfigSchema.parse({})

/**
 * Extract a TranslateProjectConfig from a fully-loaded ITranslatorConfig,
 * falling back to VS Code / platform settings via the ConfigProvider for
 * fields that are absent in translator.json.
 */
export function toProjectConfig(
  config: ITranslatorConfig,
  configProvider: ConfigProvider
): TranslateProjectConfig {
  return {
    sourceDir: config.sourceDir || defaultConfig.sourceDir,
    targetDir: config.targetDir || defaultConfig.targetDir,
    sourcePaths: config.sourcePaths?.length
      ? config.sourcePaths
      : defaultConfig.sourcePaths,
    sourceLocale:
      config.sourceLocale ||
      configProvider.get<string>(
        'translator.sourceLocale',
        defaultConfig.sourceLocale
      ),
    targetLocales:
      config.targetLocales?.length
        ? config.targetLocales
        : configProvider.get<string[]>(
            'translator.targetLocales',
            defaultConfig.targetLocales
          ),
    enableBackTranslation:
      config.enableBackTranslation ??
      configProvider.get<boolean>(
        'translator.enableBackTranslation',
        defaultConfig.enableBackTranslation
      ),
    defaultMarkdownEngine:
      config.defaultMarkdownEngine ||
      configProvider.get<TranslatorEngine>(
        'translator.defaultMarkdownEngine',
        defaultConfig.defaultMarkdownEngine
      ),
    defaultJsonEngine:
      config.defaultJsonEngine ||
      configProvider.get<TranslatorEngine>(
        'translator.defaultJsonEngine',
        defaultConfig.defaultJsonEngine
      ),
    engineOverrides:
      Object.keys(config.engineOverrides ?? {}).length > 0
        ? config.engineOverrides
        : Object.fromEntries(
            Object.entries(
              configProvider.get<Record<string, string | string[]>>(
                'translator.engineOverrides',
                {}
              )
            ).map(([engine, localesStr]) => [
              engine,
              typeof localesStr === 'string'
                ? localesStr.split(',').map((s) => s.trim())
                : Array.isArray(localesStr)
                  ? localesStr
                  : []
            ])
          ),
    excludeKeys: config.excludeKeys ?? defaultConfig.excludeKeys,
    excludeKeyPaths: config.excludeKeyPaths ?? defaultConfig.excludeKeyPaths,
    copyOnlyFiles: config.copyOnlyFiles ?? defaultConfig.copyOnlyFiles,
    csvExportPath: config.csvExportPath ?? defaultConfig.csvExportPath,
    autoExport: config.autoExport ?? defaultConfig.autoExport,
    autoImport: config.autoImport ?? defaultConfig.autoImport
  }
}

/**
 * Load project configuration from translator.json.
 *
 * When a pre-loaded `ITranslatorConfig` is provided the file is NOT re-parsed;
 * only the configProvider fallback logic is applied.  Otherwise the full
 * loadTranslatorConfig pipeline runs (env + JSON + Zod validation).
 *
 * @param rootPath        Workspace / project root
 * @param configProvider  Platform-specific config provider (VS Code settings, etc.)
 * @param logger          Diagnostic logger
 * @param _fileSystem     (unused — kept for backward compatibility)
 * @param preloaded       Optional pre-loaded config to avoid re-parsing translator.json
 * @param getPassphrase   Optional passphrase supplier for encrypted keys
 */
export function loadProjectConfig(
  rootPath: string,
  configProvider: ConfigProvider,
  logger: Logger,
  _fileSystem?: FileSystem,
  preloaded?: ITranslatorConfig,
  getPassphrase?: GetPassphrase
): TranslateProjectConfig {
  const config = preloaded ?? loadTranslatorConfig(rootPath, logger, getPassphrase).config
  return toProjectConfig(config, configProvider)
}
