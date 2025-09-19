export * from './json'
export * from './markdown'
export * from './yaml'
export * from './structured'

import { extractJSON, JsonExtraction } from './json'
import { extractMarkdownOrMDX, MarkdownExtraction } from './markdown'
import { extractYAML } from './yaml'

export function extractForFile(filename: string, content: string): JsonExtraction | MarkdownExtraction {
  const lowerFilename = filename.toLowerCase()

  if (lowerFilename.endsWith('.json')) {
    return extractJSON(content)
  } else if (lowerFilename.endsWith('.yaml') || lowerFilename.endsWith('.yml')) {
    return extractYAML(content)
  } else {
    return extractMarkdownOrMDX(content)
  }
}
