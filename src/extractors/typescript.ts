import JSON5 from 'json5'
import { extractStructuredData, StructuredDataExtraction, ExcludeOptions } from './structured'

/**
 * Regex matching the supported TS default-export shape.
 * Captures:
 *   group 1 = everything before the JSON payload (prefix)
 *   group 2 = the JSON object/array literal
 *   group 3 = everything after the payload (suffix, e.g. semicolon + newline)
 *
 * Supports optional `as const`, trailing semicolons and whitespace.
 */
const TS_EXPORT_RE = /^(export\s+default\s+)([\s\S]+?)\s*((?:\s+as\s+const)?\s*;?\s*)$/

/**
 * Format a parsed data structure back to JavaScript object literal syntax.
 *
 * Produces output with:
 *  - Unquoted property keys (when valid identifiers)
 *  - Single-quoted string values
 *  - Trailing newline-friendly formatting
 */
export function formatAsJsLiteral(data: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent)
  const innerPad = '  '.repeat(indent + 1)

  if (data === null || data === undefined) return 'null'
  if (typeof data === 'boolean' || typeof data === 'number') return String(data)

  if (typeof data === 'string') {
    // Escape single quotes and backslashes in the value
    const escaped = data.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `'${escaped}'`
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]'
    const items = data.map(item => `${innerPad}${formatAsJsLiteral(item, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const lines = entries.map(([key, value]) => {
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`
      return `${innerPad}${formattedKey}: ${formatAsJsLiteral(value, indent + 1)}`
    })
    return `{\n${lines.join(',\n')}\n${pad}}`
  }

  return String(data)
}

/**
 * Strip the `export default` wrapper and return the JS literal payload plus
 * the prefix/suffix needed to restore the wrapper after translation.
 *
 * Throws if the file doesn't match the supported shape.
 */
export function unwrapTsExport(input: string): { prefix: string; json: string; suffix: string } {
  const trimmed = input.trim()
  const match = trimmed.match(TS_EXPORT_RE)
  if (!match) {
    throw new Error(
      'Unsupported TypeScript shape. Only `export default { ... }` or `export default [ ... ]` is supported.'
    )
  }
  return { prefix: match[1], json: match[2], suffix: match[3] }
}

/**
 * Re-wrap translated output back into a TS default-export file.
 */
export function wrapTsExport(prefix: string, jsOutput: string, suffix: string): string {
  return `${prefix}${jsOutput}${suffix}\n`
}

/**
 * Extract translatable strings from a TypeScript file that default-exports
 * an object or array literal.
 *
 * Uses JSON5 for parsing, which supports unquoted keys, single-quoted strings,
 * trailing commas, and comments. Output preserves JS literal style.
 */
export function extractTypeScript(input: string, options?: ExcludeOptions): StructuredDataExtraction {
  const { prefix, json, suffix } = unwrapTsExport(input)

  let obj: unknown
  try {
    obj = JSON5.parse(json)
  } catch (parseError) {
    throw new Error(
      `TypeScript default export is not a supported literal. ` +
        `Only static data (objects, arrays, strings, numbers, booleans, null) is supported. ` +
        `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    )
  }

  // Format function: JS literal style then re-wrap in TS export
  const formatOutput = (data: unknown) => wrapTsExport(prefix, formatAsJsLiteral(data), suffix)

  return extractStructuredData(obj, formatOutput, 'json', options)
}
