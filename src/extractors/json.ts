import JSON5 from 'json5'
import { extractStructuredData, pathToString, StructuredDataExtraction, ExcludeOptions } from './structured'

// Re-export the renamed type and function for backward compatibility
export type JsonExtraction = StructuredDataExtraction
export const jsonPathToString = pathToString

/**
 * Extracts translatable strings from a JSON file.
 *
 * Uses JSON5 for parsing, which supports single-quoted strings, unquoted keys,
 * trailing commas, and comments. Output is always strict JSON.
 */
export function extractJSON(input: string, options?: ExcludeOptions): JsonExtraction {
  const obj = JSON5.parse(input)

  // Format function: always output strict JSON
  const formatJson = (data: unknown) => JSON.stringify(data, null, 2)

  return extractStructuredData(obj, formatJson, 'json', options)
}

