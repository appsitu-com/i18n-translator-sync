/**
 * Shared utilities for structured data extraction (JSON, YAML, etc.)
 */

export type ExtractorKind = 'json' | 'yaml' | 'markdown'

/**
 * Options for excluding keys/paths from translation.
 * Excluded values are preserved unchanged in rebuild output.
 */
export interface ExcludeOptions {
  /** Key names to exclude at any depth */
  excludeKeys?: string[]
  /** Exact dotted paths to exclude (e.g. "meta.version") */
  excludeKeyPaths?: string[]
}

export type StructuredDataExtraction = {
  kind: ExtractorKind
  segments: string[]
  paths: (string | number)[][]
  rebuild: (translated: string[]) => string
  makeContexts: (ctx: Record<string, string>) => (string | null)[]
}

/**
 * Convert a path array to a string representation
 */
export function pathToString(p: (string | number)[]): string {
  return p
    .map((seg) =>
      typeof seg === 'number'
        ? `[${seg}]`
        : /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)
        ? `.` + seg
        : `["${String(seg).replace(/"/g, '\\"')}"]`
    )
    .join('')
    .replace(/^\./, '')
}

/**
 * Check whether a key/path should be excluded from translation.
 */
export function isExcluded(
  currentPath: (string | number)[],
  excludeKeys: ReadonlySet<string>,
  excludeKeyPaths: ReadonlySet<string>
): boolean {
  // Check last key segment against excludeKeys
  if (currentPath.length > 0) {
    const lastKey = currentPath[currentPath.length - 1]
    if (typeof lastKey === 'string' && excludeKeys.has(lastKey)) {
      return true
    }
  }
  // Check full dotted path against excludeKeyPaths
  if (excludeKeyPaths.size > 0 && excludeKeyPaths.has(pathToString(currentPath))) {
    return true
  }
  return false
}

/**
 * Extract string values from a structured data object (like parsed JSON or YAML)
 * Returns segments, paths, and functions to rebuild and make contexts
 */
export function extractStructuredData(
  obj: any,
  formatOutput: (obj: any) => string,
  kind: ExtractorKind = 'json',
  options?: ExcludeOptions
): StructuredDataExtraction {
  const paths: (string | number)[][] = []
  const segments: string[] = []
  const excludeKeysSet = new Set(options?.excludeKeys ?? [])
  const excludeKeyPathsSet = new Set(options?.excludeKeyPaths ?? [])

  // Custom walker function to extract string values
  const walk = (node: any, path: (string | number)[]) => {
    // Skip excluded subtrees entirely
    if (path.length > 0 && isExcluded(path, excludeKeysSet, excludeKeyPathsSet)) {
      return
    }

    if (typeof node === 'string') {
      // Found a string - add it to our collection
      paths.push([...path])
      segments.push(node)
      return
    }

    // Handle arrays
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, [...path, index])
      })
      return
    }

    // Handle objects
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(key => {
        walk(node[key], [...path, key])
      })
    }

    // Ignore all other types (number, boolean, null)
  }

  // Start walking from the root
  walk(obj, [])

  // Create a function to generate contexts
  const makeContexts = (ctx: Record<string, string>) => paths.map((p) => ctx[pathToString(p)] ?? null)

  // Create a function to rebuild the object with translations
  const rebuild = (translated: string[]) => {
    let i = 0
    const clone = structuredClone(obj)

    // Custom rebuilder that mirrors the walker (must skip excluded paths)
    const rebuildNode = (node: any, path: (string | number)[]) => {
      // Skip excluded subtrees — they are preserved unchanged in clone
      if (path.length > 0 && isExcluded(path, excludeKeysSet, excludeKeyPathsSet)) {
        return
      }

      if (typeof node === 'string') {
        // Update path with translation
        let current: Record<string | number, any> = clone
        const lastIndex = path.length - 1

        for (let j = 0; j < lastIndex; j++) {
          current = current[path[j]] as Record<string | number, any>
        }

        if (lastIndex >= 0) {
          current[path[lastIndex]] = translated[i++] ?? node
        }
        return
      }

      // Handle arrays
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          rebuildNode(item, [...path, index])
        })
        return
      }

      // Handle objects
      if (node !== null && typeof node === 'object') {
        Object.keys(node).forEach(key => {
          rebuildNode(node[key], [...path, key])
        })
      }

      // Ignore all other types
    }

    // Start rebuilding from the root
    rebuildNode(obj, [])

    // Format the output using the provided formatter
    return formatOutput(clone)
  }

  return { kind, segments, paths, rebuild, makeContexts }
}
