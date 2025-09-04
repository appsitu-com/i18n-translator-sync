export type JsonExtraction = {
  kind: 'json'
  segments: string[]
  paths: (string | number)[][]
  rebuild: (translated: string[]) => string
  makeContexts: (ctx: Record<string, string>) => (string | null)[]
}

export function jsonPathToString(p: (string | number)[]): string {
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

export function extractJSON_valuesOnly(input: string): JsonExtraction {
  const obj = JSON.parse(input)
  const paths: (string | number)[][] = []
  const segments: string[] = []

  // Custom walker function that doesn't rely on the visitor for edge cases
  const walk = (node: any, path: (string | number)[]) => {
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

  const makeContexts = (ctx: Record<string, string>) => paths.map((p) => ctx[jsonPathToString(p)] ?? null)

  const rebuild = (translated: string[]) => {
    let i = 0
    const clone = structuredClone(obj)

    // Custom rebuilder that mirrors the walker
    const rebuildNode = (node: any, path: (string | number)[]) => {
      if (typeof node === 'string') {
        // Update path with translation
        let current = clone
        const lastIndex = path.length - 1

        for (let j = 0; j < lastIndex; j++) {
          current = current[path[j]]
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

    return JSON.stringify(clone, null, 2)
  }

  return { kind: 'json', segments, paths, rebuild, makeContexts }
}

