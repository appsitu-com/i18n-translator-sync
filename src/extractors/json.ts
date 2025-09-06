import { extractStructuredData, pathToString, StructuredDataExtraction } from './structured'

// Re-export the renamed type and function for backward compatibility
export type JsonExtraction = StructuredDataExtraction
export const jsonPathToString = pathToString

/**
 * Extracts translatable strings from a JSON file
 */
export function extractJSON(input: string): JsonExtraction {
  const obj = JSON.parse(input)

  // Format function for JSON output
  const formatJson = (data: any) => JSON.stringify(data, null, 2)

  return extractStructuredData(obj, formatJson, 'json')
}

