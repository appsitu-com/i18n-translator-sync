import { z } from 'zod'

/**
 * Shared configuration utilities
 */

/**
 * Format Zod validation errors for better user feedback
 * @param error The Zod validation error
 * @returns Array of formatted error messages
 */
export function formatZodError(error: z.ZodError): string[] {
  const ENGINES = ['azure', 'google', 'deepl', 'gemini', 'openrouter', 'mymemory', 'copy', 'auto'] as const;

  return error.issues.map((issue) => {
    const fieldName = issue.path.join('.');

    switch (fieldName) {
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