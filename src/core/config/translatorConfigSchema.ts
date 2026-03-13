import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** Maps application locale codes to engine-specific locale codes or names. */
const LangMapSchema = z.record(z.string(), z.string()).optional().default({})

/** Retry behavior for HTTP calls to a translation engine. */
const RetrySchema = z
  .object({
    maxRetries: z.number().int().min(0).optional().default(2),
    delayMs: z.number().int().min(0).optional().default(100),
    backoffFactor: z.number().min(1).optional().default(2)
  })
  .optional()

// ---------------------------------------------------------------------------
// Engine-specific config schemas
// ---------------------------------------------------------------------------

/** Microsoft Azure Translator */
export const AzureConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z
    .string()
    .optional()
    .default('https://api.cognitive.microsofttranslator.com'),
  region: z.string().optional(),
  azureModel: z.string().optional(),
  category: z.string().optional(),
  batchSize: z.number().int().min(1).optional(),
  timeoutMs: z.number().int().min(0).optional().default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Google Cloud Translation */
export const GoogleConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z
    .string()
    .optional()
    .default('https://translation.googleapis.com'),
  googleProjectId: z.string().optional(),
  googleLocation: z.string().optional().default('global'),
  googleModel: z.string().optional(),
  timeoutMs: z.number().int().min(0).optional().default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** DeepL Translation */
export const DeepLConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().optional().default('https://api-free.deepl.com'),
  free: z.boolean().optional().default(false),
  formality: z.string().optional(),
  deeplModel: z.string().optional(),
  timeoutMs: z.number().int().min(0).optional().default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Google Gemini (LLM-based translation) */
export const GeminiConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z
    .string()
    .optional()
    .default('https://generativelanguage.googleapis.com/v1beta'),
  geminiModel: z.string().optional().default('gemini-pro'),
  temperature: z.number().min(0).max(2).optional().default(0.1),
  maxOutputTokens: z.number().int().min(1).optional().default(1024),
  timeoutMs: z.number().int().min(0).optional().default(60_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** OpenRouter (multi-model LLM gateway) */
export const OpenRouterConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z
    .string()
    .optional()
    .default('https://openrouter.ai/api/v1/chat/completions'),
  openrouterModel: z
    .string()
    .optional()
    .default('anthropic/claude-3-haiku'),
  temperature: z.number().min(0).max(2).optional().default(0.1),
  maxOutputTokens: z.number().int().min(1).optional().default(2048),
  systemPrompt: z.string().optional(),
  timeoutMs: z.number().int().min(0).optional().default(60_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** MyMemory translation engine */
export const MyMemoryConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z
    .string()
    .optional()
    .default('https://api.mymemory.translated.net/get'),
  email: z.string().optional(),
  timeoutMs: z.number().int().min(0).optional().default(15_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Copy engine (no-op, returns input unchanged) */
export const CopyConfigSchema = z.object({}).optional().default({})

// ---------------------------------------------------------------------------
// Translator engines record – all engine configs live here
// ---------------------------------------------------------------------------

export const TranslatorEnginesSchema = z.object({
  azure: AzureConfigSchema.optional(),
  google: GoogleConfigSchema.optional(),
  deepl: DeepLConfigSchema.optional(),
  gemini: GeminiConfigSchema.optional(),
  openrouter: OpenRouterConfigSchema.optional(),
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
  sourceDir: z
    .string()
    .optional()
    .default('')
    .describe('Base directory prepended to sourcePaths'),
  targetDir: z
    .string()
    .optional()
    .default('')
    .describe('Base directory prepended to generated target paths'),
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

export type ITranslatorConfig = z.infer<typeof TranslatorConfigSchema>

export type IAzureConfig = z.infer<typeof AzureConfigSchema>
export type IGoogleConfig = z.infer<typeof GoogleConfigSchema>
export type IDeepLConfig = z.infer<typeof DeepLConfigSchema>
export type IGeminiConfig = z.infer<typeof GeminiConfigSchema>
export type IOpenRouterConfig = z.infer<typeof OpenRouterConfigSchema>
export type IMyMemoryConfig = z.infer<typeof MyMemoryConfigSchema>
export type ICopyConfig = z.infer<typeof CopyConfigSchema>
export type ITranslatorEngines = z.infer<typeof TranslatorEnginesSchema>

export type TranslatorEngine = z.infer<typeof TranslatorEngineSchema>
