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
  const fences = protect(input, FENCE);
  const inl = protect(fences.masked, INLINE);
  // Extract link descriptions for translation, preserve URLs
  let linkSegments: { full: string, desc: string, url: string, idx: number }[] = [];
  let linkIdx = 0;
  const linkReplaced = inl.masked.replace(LINK, (m) => {
    const match = m.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (match) {
      linkSegments.push({ full: m, desc: match[1], url: match[2], idx: linkIdx });
      return `LINK${linkIdx++}`;
    }
    return m;
  });

  // Split into paragraphs
  const parts = linkReplaced.split(/\n{2,}/);
  let segments: string[] = [];
  let linkMap = new Map<number, { desc: string, url: string }>();
  linkSegments.forEach(l => linkMap.set(l.idx, { desc: l.desc, url: l.url }));

  // Extract segments: paragraphs and link descriptions
  parts.forEach((s) => {
    let trimmed = s.trim();
    if (!trimmed) return;
    // Extract link placeholders
    const linkPlaceholderRe = /\u001bLINK(\d+)\u001b/g;
    let lastIdx = 0;
    let match;
    let found = false;
    while ((match = linkPlaceholderRe.exec(trimmed)) !== null) {
      found = true;
      // Add text before link as segment
      if (match.index > lastIdx) {
        const before = trimmed.slice(lastIdx, match.index).trim();
        if (before) segments.push(before);
      }
      // Add link description as segment
      const linkNum = Number(match[1]);
      segments.push(linkMap.get(linkNum)?.desc ?? '');
      lastIdx = match.index + match[0].length;
    }
    // Add remaining text after last link
    if (found && lastIdx < trimmed.length) {
      const after = trimmed.slice(lastIdx).trim();
      if (after) segments.push(after);
    }
    if (!found) segments.push(trimmed);
  });

  const rebuild = (translated: string[]) => {
    let t = 0;
    // Rebuild paragraphs with translated segments and original URLs
    const rebuiltParts = parts.map((chunk) => {
      let rebuilt = '';
      let lastIdx = 0;
      const linkPlaceholderRe = /\u001bLINK(\d+)\u001b/g;
      let match;
      let found = false;
      while ((match = linkPlaceholderRe.exec(chunk)) !== null) {
        found = true;
        // Add text before link
        if (match.index > lastIdx) {
          const before = chunk.slice(lastIdx, match.index);
          if (before.trim()) rebuilt += translated[t++] ?? before;
          else rebuilt += before;
        }
        // Add translated link description with original URL
        const linkNum = Number(match[1]);
        rebuilt += `[${translated[t++] ?? linkMap.get(linkNum)?.desc ?? ''}](${linkMap.get(linkNum)?.url ?? ''})`;
        lastIdx = match.index + match[0].length;
      }
      // Add remaining text after last link
      if (found && lastIdx < chunk.length) {
        const after = chunk.slice(lastIdx);
        if (after.trim()) rebuilt += translated[t++] ?? after;
        else rebuilt += after;
      }
      if (!found) rebuilt = translated[t++] ?? chunk;
      return rebuilt;
    });
    // Restore inline code and code fences
    return restore(restore(rebuiltParts.join('\n\n'), inl.slots), fences.slots);
  };
  return { kind: 'markdown', segments, rebuild };
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
    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        if (typeof v === 'string') {
          paths.push([...path, i])
          segments.push(v)
        } else {
          walk(v, [...path, i])
        }
      })
    } else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        const v = node[k]
        if (typeof v === 'string') {
          paths.push([...path, k])
          segments.push(v)
        } else {
          walk(v, [...path, k])
        }
      }
    }
  }
  walk(obj, [])

  const makeContexts = (ctx: Record<string, string>) => paths.map((p) => ctx[jsonPathToString(p)] ?? null)

  const rebuild = (translated: string[]) => {
    let i = 0
    const clone = structuredClone(obj)
    const assign = (node: any, path: any[]) => {
      if (Array.isArray(node)) {
        node.forEach((v, idx) => {
          if (typeof v === 'string') node[idx] = translated[i++] ?? v
          else assign(v, [...path, idx])
        })
      } else if (node && typeof node === 'object') {
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
