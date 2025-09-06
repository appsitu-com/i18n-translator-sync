import * as yaml from 'js-yaml'
import { JsonExtraction } from './json'
import { extractStructuredData } from './structured'

/**
 * Extracts translatable strings from a YAML file
 * Uses the same approach as JSON extraction but with YAML parsing
 */
export function extractYAML(input: string): JsonExtraction {
  // Parse YAML content - this will convert it to a JS object similar to JSON.parse
  const obj = yaml.load(input)

  // Format function for YAML output
  const formatYaml = (data: any) => yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // Don't wrap lines
    noRefs: true,  // Don't use references
    quotingType: '"' // Use double quotes for strings
  })

  return extractStructuredData(obj, formatYaml, 'yaml')
}
