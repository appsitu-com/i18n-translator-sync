export * from './json'
export * from './markdown'
export * from './yaml'
export * from './structured'
export * from './typescript'

import { extractJSON, JsonExtraction } from './json'
import { extractMarkdownOrMDX, MarkdownExtraction } from './markdown'
import { extractYAML } from './yaml'
import { extractTypeScript } from './typescript'
import { ExcludeOptions } from './structured'

export function extractForFile(
  filename: string,
  content: string,
  options?: ExcludeOptions
): JsonExtraction | MarkdownExtraction {
  const lowerFilename = filename.toLowerCase()

  if (lowerFilename.endsWith('.json')) {
    return extractJSON(content, options)
  } else if (lowerFilename.endsWith('.yaml') || lowerFilename.endsWith('.yml')) {
    return extractYAML(content, options)
  } else if (
    lowerFilename.endsWith('.ts') ||
    lowerFilename.endsWith('.js') ||
    lowerFilename.endsWith('.mjs') ||
    lowerFilename.endsWith('.cjs')
  ) {
    return extractTypeScript(content, options)
  } else {
    return extractMarkdownOrMDX(content, undefined, options)
  }
}
