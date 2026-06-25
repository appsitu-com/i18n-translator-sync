import { type Pair, type ITranslationMemory } from '../../src/core/tm/ITranslationMemory';
import * as fs from 'fs';
import * as nodePath from 'path';

/**
 * Mock implementation of the translation cache for testing.
 */
export class MockTranslationMemory implements ITranslationMemory {
  private path: string;
  private translations: Map<string, { translated_text: string, updated_at: number }> = new Map();

  constructor(path: string) {
    this.path = path;
    const dir = nodePath.dirname(path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    console.log(`[MOCK] Created translation cache at ${path}`);
  }

  hasSourcePath(sourcePath: string): Promise<boolean> {
    throw new Error('Method not implemented.')
  }
  hasPendingPurge(): Promise<boolean> {
    throw new Error('Method not implemented.')
  }
  purge(): Promise<{ deletedCount: number }> {
    throw new Error('Method not implemented.')
  }
  completePurge(): Promise<{ deletedCount: number }> {
    throw new Error('Method not implemented.')
  }
  isNew(): boolean {
    throw new Error('Method not implemented.')
  }

  async getMany({
    engine,
    sourceLocale,
    targetLocale,
    texts,
    contexts
  }: {
    engine: string
    sourceLocale: string
    targetLocale: string
    texts: string[]
    contexts: (string | null | undefined)[]
    sourcePath?: string
    positions?: (number | string)[]
  }): Promise<Map<string, { translation: string; textPos?: number | string }>> {
    const out = new Map<string, { translation: string; textPos?: number | string }>();

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const c = (contexts[i] ?? '').toString();
      const key = `${engine}:${sourceLocale}:${targetLocale}:${t}:${c}`;
      const entry = this.translations.get(key);

      if (entry) {
        out.set(`${t}\u0001${c}`, { translation: entry.translated_text });
      }
    }

    return out;
  }

  async putMany({ engine, sourceLocale, targetLocale, pairs }: { engine: string; sourceLocale: string; targetLocale: string; pairs: Pair[] }): Promise<void> {
    for (const { src, dst, ctx } of pairs) {
      const context = (ctx ?? '').toString();
      const key = `${engine}:${sourceLocale}:${targetLocale}:${src}:${context}`;
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

  async exportTMX(filePath: string, options?: { origin?: string }): Promise<number> {
    const entries = Array.from(this.translations.entries())
      .filter(() => !options?.origin || options.origin === 'human' || options.origin === 'ai')

    if (entries.length === 0) {
      return 0
    }

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const rows = entries.map(([key, value]) => {
      const [, srcLang, tgtLang, srcText] = key.split(':')
      return [
        '    <tu>',
        `      <tuv xml:lang="${escapeXml(srcLang)}"><seg>${escapeXml(srcText)}</seg></tuv>`,
        `      <tuv xml:lang="${escapeXml(tgtLang)}"><seg>${escapeXml(value.translated_text)}</seg></tuv>`,
        '    </tu>'
      ].join('\n')
    })

    const tmx = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tmx version="1.4">',
      '  <header creationtool="i18n-translator-sync" creationtoolversion="0.12.0" segtype="sentence" adminlang="en" srclang="en" datatype="PlainText"/>',
      '  <body>',
      rows.join('\n'),
      '  </body>',
      '</tmx>',
      ''
    ].join('\n')

    fs.writeFileSync(filePath, tmx, 'utf8')
    return entries.length
  }

  async exportXLIFF(filePath: string, options?: { origin?: string }): Promise<number> {
    const entries = Array.from(this.translations.entries())
      .filter(() => !options?.origin || options.origin === 'human' || options.origin === 'ai')

    if (entries.length === 0) {
      return 0
    }

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const units = entries.map(([key, value], index) => {
      const [, , , srcText] = key.split(':')
      return [
        `      <trans-unit id="${index + 1}">`,
        `        <source>${escapeXml(srcText)}</source>`,
        `        <target>${escapeXml(value.translated_text)}</target>`,
        '      </trans-unit>'
      ].join('\n')
    })

    const xliff = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xliff version="1.2">',
      '  <file source-language="en" target-language="en" original="translation-memory">',
      '    <body>',
      units.join('\n'),
      '    </body>',
      '  </file>',
      '</xliff>',
      ''
    ].join('\n')

    fs.writeFileSync(filePath, xliff, 'utf8')
    return entries.length
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

  didMigrateFromV1(): boolean {
    return false;
  }

  clearMigrationFlag(): void {
    // Mock does nothing
  }

  close(): void {
    console.log(`[MOCK] Closed translation cache at ${this.path}`);
  }
}

// Export the mock cache for use in tests
export { type Pair, type ITranslationMemory };