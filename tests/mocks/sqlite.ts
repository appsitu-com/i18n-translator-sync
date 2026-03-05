import { SQLiteCache as OriginalSQLiteCache, type Pair, type TranslationCache } from '../../src/core/cache/sqlite';
import * as fs from 'fs';
import * as nodePath from 'path';

/**
 * Mock implementation of SQLiteCache for testing
 * This can be used when native SQLite modules cause issues in test environments
 */
export class MockSQLiteCache implements TranslationCache {
  private path: string;
  private translations: Map<string, { translated_text: string, updated_at: number }> = new Map();

  constructor(path: string) {
    this.path = path;
    const dir = nodePath.dirname(path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    console.log(`[MOCK] Created SQLite cache at ${path}`);
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
  }): Promise<Map<string, string>> {
    const out = new Map<string, string>();

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const c = (contexts[i] ?? '').toString();
      const key = `${engine}:${source}:${target}:${t}:${c}`;
      const entry = this.translations.get(key);

      if (entry) {
        out.set(`${t}\u0001${c}`, entry.translated_text);
      }
    }

    return out;
  }

  async putMany({ engine, source, target, pairs }: { engine: string; source: string; target: string; pairs: Pair[] }): Promise<void> {
    for (const { src, dst, ctx } of pairs) {
      const context = (ctx ?? '').toString();
      const key = `${engine}:${source}:${target}:${src}:${context}`;
      this.translations.set(key, {
        translated_text: dst,
        updated_at: Math.floor(Date.now() / 1000)
      });
    }
  }

  async exportCSV(filePath: string): Promise<void> {
    const lines: string[] = ['engine_name,source_lang,target_lang,source_text,context,translated_text,updated_at'];

    const esc = (s: string) => {
      const safe = (s ?? '').replace(/\"/g, '""');
      return `"${safe}"`;
    };

    for (const [key, value] of this.translations.entries()) {
      const [engine, srcLang, tgtLang, srcText, ctx] = key.split(':');
      const { translated_text, updated_at } = value;

      const line = [
        engine,
        srcLang,
        tgtLang,
        srcText,
        ctx,
        translated_text,
        updated_at.toString()
      ].map(esc).join(',');

      lines.push(line);
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }

  async importCSV(filePath: string): Promise<number> {
    if (!fs.existsSync(filePath)) return 0;

    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    let imported = 0;

    const parseCSVLine = (line: string): string[] => {
      const out: string[] = [];
      let i = 0, cur = '', q = false;

      while (i < line.length) {
        const ch = line[i++];
        if (q) {
          if (ch === '"') {
            if (line[i] === '"') {
              cur += '"';
              i++;
            } else q = false;
          } else cur += ch;
        } else {
          if (ch === ',') {
            out.push(cur);
            cur = '';
          } else if (ch === '"') q = true;
          else cur += ch;
        }
      }
      out.push(cur);
      return out;
    };

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;

      const parts = parseCSVLine(line);
      if (parts.length < 6) continue;

      const [engine, srcLang, tgtLang, srcText, ctx, dstText, updatedAt] = parts;
      const ts = updatedAt ? Number(updatedAt) : Math.floor(Date.now() / 1000);

      const key = `${engine}:${srcLang}:${tgtLang}:${srcText}:${ctx}`;
      this.translations.set(key, {
        translated_text: dstText,
        updated_at: ts
      });

      imported++;
    }

    return imported;
  }

  close(): void {
    console.log(`[MOCK] Closed SQLite cache at ${this.path}`);
  }
}

// Export the MockSQLiteCache for use in tests
export { type Pair, type TranslationCache };