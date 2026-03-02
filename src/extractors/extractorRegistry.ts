export * from './json.js'
export * from './markdown.js'
export * from './yaml.js'
export * from './structured.js'
export * from './typescript.js'

import { extractJSON, JsonExtraction } from './json'
import { extractMarkdownOrMDX, MarkdownExtraction } from './markdown.js'
import { extractYAML } from './yaml'
import { extractTypeScript } from './typescript.js'
import { ExcludeOptions } from './structured.js'

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
  } else if (lowerFilename.endsWith('.ts')) {
    return extractTypeScript(content, options)
  } else {
    return extractMarkdownOrMDX(content, undefined, options)
  }
}
