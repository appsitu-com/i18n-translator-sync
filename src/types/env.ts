/**
 * Environment variable utilities for the application
 * This helps provide type safety and consistent access to environment variables
 */

// We need to define a single source of truth for our environment variables
// In TypeScript, we can't automatically extract runtime values from type declarations
// So we'll define them here and use them for both types and runtime functions

/**
 * Define API key environment variables
 * These should match the ones declared in env.d.ts
 */
const API_KEYS = [
  'AZURE_TRANSLATION_KEY',
  'GOOGLE_TRANSLATION_KEY',
  'DEEPL_TRANSLATION_KEY',
  'GEMINI_API_KEY'
] as const;

// Export the type derived from our constants
export type ApiKeyEnvVars = typeof API_KEYS[number];

/**
 * Helper function to get all API key environment variable names
 * @returns Array of API key environment variable names
 */
export function getApiKeyEnvVars(): ApiKeyEnvVars[] {
  return [...API_KEYS];
}

/**
 * Define API URL environment variables
 * These should match the ones declared in env.d.ts
 */
const API_URLS = [
  'AZURE_TRANSLATION_REGION',
  'AZURE_TRANSLATION_URL',
  'GOOGLE_TRANSLATION_URL',
  'DEEPL_TRANSLATION_URL'
] as const;

// Export the type derived from our constants
export type ApiUrlEnvVars = typeof API_URLS[number];

/**
 * Helper function to get all URL and region environment variable names
 * @returns Array of API URL environment variable names
 */
export function getApiUrlEnvVars(): ApiUrlEnvVars[] {
  return [...API_URLS];
}