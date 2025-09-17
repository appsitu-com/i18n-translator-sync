/**
 * Shared utilities for formatting context CSV warning messages
 */

/**
 * Interface for context CSV statistics from loadContextCsvForJson
 */
export interface ContextCsvStats {
  duplicates: string[]
  emptyValues: string[]
  fileUri?: { fsPath: string } | null
}

/**
 * Formats a list of items for display in warning messages, truncating if needed
 * @param items Array of items to format
 * @param maxItems Maximum number of items to show before truncating (default: 6)
 * @returns Formatted string with ellipsis if truncated
 */
export function formatItemList(items: string[], maxItems: number = 6): string {
  const displayItems = items.slice(0, maxItems)
  const truncated = items.length > maxItems
  return `${displayItems.join(', ')}${truncated ? ' …' : ''}`
}

/**
 * Generates warning messages for context CSV issues
 * @param ctxMap Context map from CSV
 * @param validPaths Set of valid paths from extraction (accepts unknown types for compatibility)
 * @param stats Statistics from CSV loading
 * @returns Array of warning messages
 */
export function generateContextCsvWarnings(
  ctxMap: Record<string, any>,
  validPaths: Set<unknown>,
  stats: ContextCsvStats
): string[] {
  const unknown = Object.keys(ctxMap).filter((k) => !validPaths.has(k))
  const msgs: string[] = []

  if (unknown.length) {
    msgs.push(`Unknown context path(s): ${formatItemList(unknown)}`)
  }

  if (stats.duplicates.length) {
    msgs.push(`Duplicate path(s): ${formatItemList(stats.duplicates)}`)
  }

  if (stats.emptyValues.length) {
    msgs.push(`Empty context value(s): ${formatItemList(stats.emptyValues)}`)
  }

  return msgs
}