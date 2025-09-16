import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

export type Pair = { src: string; dst: string; ctx?: string | null }

export interface TranslationCache {
  getMany(params: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
  }): Promise<Map<string, string>>
  putMany(params: { engine: string; source: string; target: string; pairs: Pair[] }): Promise<void>
  exportCSV(filePath: string): Promise<void>
  importCSV(filePath: string): Promise<number>
  close(): void
}

export class SQLiteCache implements TranslationCache {
  private db: Database.Database
  private sel: Database.Statement
  private ins: Database.Statement

  constructor(dbFile: string) {
    const dir = path.dirname(dbFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    this.db = Database(dbFile)
    this.db.pragma('journal_mode = WAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        engine_name     TEXT NOT NULL,
        source_lang     TEXT NOT NULL,
        target_lang     TEXT NOT NULL,
        source_text     TEXT NOT NULL,
        context         TEXT NOT NULL DEFAULT '',
        translated_text TEXT NOT NULL,
        updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (engine_name, source_lang, target_lang, source_text, context)
      );
      CREATE INDEX IF NOT EXISTS idx_translations_estc
        ON translations(engine_name, source_lang, target_lang, context);
    `)

    this.sel = this.db.prepare(`
      SELECT translated_text FROM translations WHERE engine_name = ? AND source_lang = ? AND target_lang = ? AND source_text = ? AND context = ?
    `)

    this.ins = this.db.prepare(`
      INSERT INTO translations (engine_name, source_lang, target_lang, source_text, context, translated_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT(engine_name, source_lang, target_lang, source_text, context)
      DO UPDATE SET translated_text = excluded.translated_text, updated_at = excluded.updated_at
    `)
  }

  async getMany({
    engine,
    source,
    target,
    texts,
    contexts
  }: {
    engine: string
    source: string
    target: string
    texts: string[]
    contexts: (string | null | undefined)[]
  }) {
    const out = new Map<string, string>()
    this.db.transaction(() => {
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i]
        const c = (contexts[i] ?? '').toString()
        const row = this.sel.get(engine, source, target, t, c) as any
        if (row) out.set(`${t}::${c}`, row.translated_text)
      }
    })()
    return out
  }

  async putMany({ engine, source, target, pairs }: { engine: string; source: string; target: string; pairs: Pair[] }) {
    this.db.transaction(() => {
      for (const { src, dst, ctx } of pairs) this.ins.run(engine, source, target, src, (ctx ?? '').toString(), dst)
    })()
  }

  async exportCSV(filePath: string) {
    const rows = this.db
      .prepare(
        `SELECT engine_name, source_lang, target_lang, source_text, context, translated_text, updated_at FROM translations ORDER BY engine_name, source_lang, target_lang, source_text, context`
      )
      .iterate()
    const fd = fs.openSync(filePath, 'w')

    fs.writeSync(fd, 'engine_name,source_lang,target_lang,source_text,context,translated_text,updated_at\n')
    const esc = (s: string) => {
      const safe = (s ?? '').replace(/"/g, '""')
      return `"${safe}"`
    }

    for (const r of rows as any) {
      const line =
        [
          r.engine_name,
          r.source_lang,
          r.target_lang,
          r.source_text,
          r.context,
          r.translated_text,
          r.updated_at.toString()
        ]
          .map(esc)
          .join(',') + '\n'
      fs.writeSync(fd, line)
    }

    fs.closeSync(fd)
  }

  async importCSV(filePath: string) {
    if (!fs.existsSync(filePath)) return 0
    const text = fs.readFileSync(filePath, 'utf8')
    const lines = text.split(/\r?\n/)
    let imported = 0
    const parseCSVLine = (line: string): string[] => {
      const out: string[] = []
      let i = 0,
        cur = '',
        q = false
      while (i < line.length) {
        const ch = line[i++]
        if (q) {
          if (ch === '"') {
            if (line[i] === '"') {
              cur += '"'
              i++
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
    }
    const stmt = this.db.prepare(`
      INSERT INTO translations (engine_name, source_lang, target_lang, source_text, context, translated_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(engine_name, source_lang, target_lang, source_text, context)
      DO UPDATE SET translated_text = excluded.translated_text, updated_at = excluded.updated_at
    `)
    this.db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line?.trim()) continue
        const parts = parseCSVLine(line)
        if (parts.length < 6) continue
        const [engine, srcLang, tgtLang, srcText, ctx, dstText, updatedAt] = parts
        const ts = updatedAt ? Number(updatedAt) : Math.floor(Date.now() / 1000)
        stmt.run(engine, srcLang, tgtLang, srcText, ctx, dstText, ts)
        imported++
      }
    })()
    return imported
  }

  close() {
    this.db.close()
  }
}
