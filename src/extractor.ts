export type Extraction =
  | {
      kind: 'markdown'
      segments: string[]
      rebuild: (translated: string[]) => string
    }
  | {
      kind: 'json'
      segments: string[]
      paths: (string | number)[][]
      rebuild: (translated: string[]) => string
      makeContexts: (ctx: Record<string, string>) => (string | null)[]
    }

const FENCE = /```[\s\S]*?```/g
const INLINE = /`[^`]*`/g
const LINK = /\[[^\]]+\]\([^\)]+\)/g

function protect(text: string, regex: RegExp) {
  const slots: string[] = []
  const masked = text.replace(regex, (m) => {
    const i = slots.push(m) - 1
    return `\uE000${i}\uE000`
  })
  return { masked, slots }
}

function restore(text: string, slots: string[]) {
  return text.replace(/\uE000(\d+)\uE000/g, (_, i) => slots[Number(i)])
}

export function extractMarkdownOrMDX(input: string): Extraction {
  const fences = protect(input, FENCE)
  const inl = protect(fences.masked, INLINE)
  const links = protect(inl.masked, LINK)
  const parts = links.masked.split(/\n{2,}/)
  const segments = parts.map((s) => s.trim()).filter(Boolean)
  const rebuild = (translated: string[]) => {
    let t = 0
    const rebuilt = links.masked
      .split(/\n{2,}/)
      .map((chunk) => {
        const trimmed = chunk.trim()
        if (!trimmed) return chunk
        return chunk.replace(trimmed, () => translated[t++] ?? trimmed)
      })
      .join('\n\n')
    return restore(restore(restore(rebuilt, links.slots), inl.slots), fences.slots)
  }
  return { kind: 'markdown', segments, rebuild }
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

export function extractJSON_valuesOnly(input: string): Extraction {
  const obj = JSON.parse(input)
  const paths: any[][] = []
  const segments: string[] = []

  const walk = (node: any, path: any[]) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...path, i]))
    else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        const v = node[k]
        if (typeof v === 'string') {
          paths.push([...path, k])
          segments.push(v)
        } else walk(v, [...path, k])
      }
    }
  }
  walk(obj, [])

  const makeContexts = (ctx: Record<string, string>) => paths.map((p) => ctx[jsonPathToString(p)] ?? null)

  const rebuild = (translated: string[]) => {
    let i = 0
    const clone = structuredClone(obj)
    const assign = (node: any, path: any[]) => {
      if (Array.isArray(node)) node.forEach((v, idx) => assign(v, [...path, idx]))
      else if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) {
          if (typeof node[k] === 'string') node[k] = translated[i++] ?? node[k]
          else assign(node[k], [...path, k])
        }
      }
    }
    assign(clone, [])
    return JSON.stringify(clone, null, 2)
  }

  return { kind: 'json', segments, paths, rebuild, makeContexts }
}

export function extractForFile(filename: string, content: string): Extraction {
  return filename.toLowerCase().endsWith('.json') ? extractJSON_valuesOnly(content) : extractMarkdownOrMDX(content)
}
