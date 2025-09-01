import * as vscode from 'vscode'

export type ContextCsv = {
  map: Record<string, string>
  stats: { duplicates: string[]; emptyValues: string[]; fileUri?: vscode.Uri }
}

export async function loadContextCsvForJson(jsonUri: vscode.Uri): Promise<ContextCsv> {
  const csvUri = vscode.Uri.file(jsonUri.fsPath.replace(/\.json$/i, '.csv'))
  const empty: ContextCsv = { map: {}, stats: { duplicates: [], emptyValues: [], fileUri: csvUri } }
  try {
    const buf = await vscode.workspace.fs.readFile(csvUri)
    const text = buf.toString().trim()
    if (!text) return empty
    const lines = text.split(/\r?\n/).filter(Boolean)
    const seen = new Map<string, number>()
    const out: Record<string, string> = {}
    const stats = { duplicates: [] as string[], emptyValues: [] as string[], fileUri: csvUri }
    for (let i = 0; i < lines.length; i++) {
      const parts = (() => {
        const out: string[] = []
        let j = 0,
          cur = '',
          q = false
        const line = lines[i]
        while (j < line.length) {
          const ch = line[j++]
          if (q) {
            if (ch === '"') {
              if (line[j] === '"') {
                cur += '"'
                j++
              } else q = false
            } else cur += ch
          } else {
            if (ch === ',') {
              out.push(cur)
              cur = ''
            } else if (ch === '"') q = true
            else cur += ch
          }
        }
        out.push(cur)
        return out
      })()
      if (parts.length < 2) continue
      const [p, c] = parts
      if (i === 0 && /path/i.test(p) && /context/i.test(c)) continue
      const key = (p || '').trim()
      const ctx = (c || '').trim()
      if (!key) continue
      const cnt = (seen.get(key) ?? 0) + 1
      seen.set(key, cnt)
      if (cnt > 1) stats.duplicates.push(key)
      if (!ctx) stats.emptyValues.push(key)
      out[key] = ctx
    }
    return { map: out, stats }
  } catch {
    return empty
  }
}
