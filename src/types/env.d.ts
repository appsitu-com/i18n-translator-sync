/**
 * Type definitions for environment variables used in the application
 * This helps provide type safety and auto-completion for environment variables
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Azure Translation API
    AZURE_TRANSLATION_KEY?: string;
    AZURE_TRANSLATION_REGION?: string;
    AZURE_TRANSLATION_URL?: string;

    // Google Translation API
    GOOGLE_TRANSLATION_KEY?: string;
    GOOGLE_TRANSLATION_URL?: string;
    GOOGLE_TRANSLATION_PROJECT_ID?: string;
    GOOGLE_TRANSLATION_LOCATION?: string;

    // DeepL Translation API
    DEEPL_TRANSLATION_KEY?: string;
    DEEPL_TRANSLATION_URL?: string;

    // Gemini AI API
    GEMINI_API_KEY?: string;

    // Node Environment
    NODE_ENV?: 'development' | 'production' | 'test';

    // Vitest flag
    VITEST?: string;
  }
}

