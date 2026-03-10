import { z } from 'zod'

/**
 * Zod schema for all known environment variables used by the translator.
 * Every field is an optional string — only the engines in use need their
 * env vars set.
 */
export const EnvVarsSchema = z.object({
  // Azure Translator
  AZURE_TRANSLATION_KEY: z.string().optional(),
  AZURE_TRANSLATION_REGION: z.string().optional(),
  AZURE_TRANSLATION_URL: z.string().optional(),

  // Google Cloud Translation
  GOOGLE_TRANSLATION_KEY: z.string().optional(),
  GOOGLE_TRANSLATION_URL: z.string().optional(),
  GOOGLE_TRANSLATION_PROJECT_ID: z.string().optional(),
  GOOGLE_TRANSLATION_LOCATION: z.string().optional(),

  // DeepL
  DEEPL_TRANSLATION_KEY: z.string().optional(),
  DEEPL_TRANSLATION_URL: z.string().optional(),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_URL: z.string().optional(),

  // OpenRouter
  OPENROUTER_API_NAME: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_URL: z.string().optional(),

  // MyMemory (optional — no standard env vars, but allow future use)
  MYMEMORY_API_KEY: z.string().optional(),
  MYMEMORY_EMAIL: z.string().optional(),

  // Internal / runtime
  I18N_TRANSLATOR_ENV_DIR: z.string().optional(),
  TRANSLATOR_KEY: z.string().optional()
})

export type IEnvVars = z.infer<typeof EnvVarsSchema>
