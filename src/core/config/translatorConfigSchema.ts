import { z } from 'zod'
import { AzureConfigSchema } from '../../translators/azure'
import { GoogleConfigSchema } from '../../translators/google'
import { DeepLConfigSchema } from '../../translators/deepl'
import { GeminiConfigSchema } from '../../translators/gemini'
import { OpenRouterConfigSchema } from '../../translators/openrouter'
import { NllbConfigSchema } from '../../translators/nllb'
import { MyMemoryConfigSchema } from '../../translators/mymemory'
import { CopyConfigSchema } from '../../translators/copy'

// Re-export engine config schemas for consumers
export {
  AzureConfigSchema,
  GoogleConfigSchema,
  DeepLConfigSchema,
  GeminiConfigSchema,
  OpenRouterConfigSchema,
  NllbConfigSchema,
  MyMemoryConfigSchema,
  CopyConfigSchema
}

// Re-export inferred types from each translator
export type { IAzureConfig } from '../../translators/azure'
export type { IGoogleConfig } from '../../translators/google'
export type { IDeepLConfig } from '../../translators/deepl'
export type { IGeminiConfig } from '../../translators/gemini'
export type { IOpenRouterConfig } from '../../translators/openrouter'
export type { INllbConfig } from '../../translators/nllb'
export type { IMyMemoryConfig } from '../../translators/mymemory'
export type { ICopyConfig } from '../../translators/copy'

// ---------------------------------------------------------------------------
// Translator engines record – all engine configs live here
// ---------------------------------------------------------------------------

export const TranslatorEnginesSchema = z.object({
  azure: AzureConfigSchema.optional(),
  google: GoogleConfigSchema.optional(),
  deepl: DeepLConfigSchema.optional(),
  gemini: GeminiConfigSchema.optional(),
  openrouter: OpenRouterConfigSchema.optional(),
  nllb: NllbConfigSchema.optional(),
  mymemory: MyMemoryConfigSchema.optional(),
  copy: CopyConfigSchema
})

// ---------------------------------------------------------------------------
// Translator engine name enum
// ---------------------------------------------------------------------------

const ENGINES = [
  'azure',
  'google',
  'deepl',
  'gemini',
  'openrouter',
  'nllb',
  'mymemory',
  'copy',
  'auto'
] as const

export const TranslatorEngineSchema = z.enum(ENGINES)

// ---------------------------------------------------------------------------
// Top-level translator.json schema
// ---------------------------------------------------------------------------

export const TranslatorConfigSchema = z.object({
  // Source & target settings
  sourcePaths: z
    .array(z.string())
    .optional()
    .default(['i18n/en'])
    .describe('Source language paths to scan for files to translate'),
  sourceLocale: z
    .string()
    .optional()
    .default('en')
    .describe('Source locale code (e.g. "en")'),
  targetLocales: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Target locales to generate translations for'),

  // Translation behavior
  enableBackTranslation: z
    .boolean()
    .optional()
    .default(false)
    .describe('Enable back-translation for quality checks'),

  // Default engines per file type
  defaultMarkdownEngine: TranslatorEngineSchema.optional()
    .default('azure')
    .describe('Default engine for Markdown / MDX files'),
  defaultJsonEngine: TranslatorEngineSchema.optional()
    .default('google')
    .describe('Default engine for JSON / YAML files'),

  // Engine overrides – key is engine name, value is array of locale patterns
  engineOverrides: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .default({})
    .describe(
      'Override the default engine for specific locale patterns (e.g. { "deepl": ["fr", "de"] })'
    ),

  // Key exclusion rules (structured files only)
  excludeKeys: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Key names to exclude from translation (matches at any depth)'),
  excludeKeyPaths: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      'Exact dotted key paths to exclude from translation (e.g. "meta.version")'
    ),
  copyOnlyFiles: z
    .array(z.string())
    .optional()
    .default([])
    .describe('File names to copy verbatim without translating'),

  // CSV cache export / import
  csvExportPath: z
    .string()
    .optional()
    .default('translator.csv')
    .describe('Path to the CSV file for cache export'),
  autoExport: z
    .boolean()
    .optional()
    .default(true)
    .describe('Automatically export cache to CSV after translations'),
  autoImport: z
    .boolean()
    .optional()
    .default(false)
    .describe('Automatically import from CSV when database is first created'),

  // Nested engine configurations
  translator: TranslatorEnginesSchema.optional()
})

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

/**
 * Zod-validated translator config augmented with the runtime rootDir
 * that was passed to loadTranslatorConfig(). This is the single source of
 * truth for resolving relative paths anywhere in the app.
 */
export type ITranslatorConfig = z.infer<typeof TranslatorConfigSchema> & {
  /** Absolute path to the workspace / project root (VS Code or CLI). */
  rootDir: string
}

export type ITranslatorEngines = z.infer<typeof TranslatorEnginesSchema>

export type TranslatorEngine = z.infer<typeof TranslatorEngineSchema>
