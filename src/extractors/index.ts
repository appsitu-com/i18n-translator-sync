export * from './json'
export * from './markdown'

import { extractJSON_valuesOnly, JsonExtraction } from './json'
import { extractMarkdownOrMDX, MarkdownExtraction } from './markdown'

export function extractForFile(filename: string, content: string): JsonExtraction | MarkdownExtraction {
  return filename.toLowerCase().endsWith('.json') ? extractJSON_valuesOnly(content) : extractMarkdownOrMDX(content)
}
