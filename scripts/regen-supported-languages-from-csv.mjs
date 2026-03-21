import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  ['google', 'src/data/google.csv'],
  ['azure', 'src/data/azure.csv'],
  ['deepl', 'src/data/deepl.csv'],
  ['nllb', 'src/data/nllb.csv']
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
    i++;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 0 && r.some((c) => String(c).length > 0));
}

const engineData = {};
for (const [engine, relPath] of files) {
  const text = fs.readFileSync(path.join(root, relPath), 'utf8');
  const parsed = parseCsv(text);
  const headers = parsed[0];
  const nameIdx = headers.indexOf('language_name');
  const codeIdx = headers.indexOf('language_code');

  if (nameIdx < 0 || codeIdx < 0) {
    throw new Error(`Missing expected headers in ${relPath}`);
  }

  engineData[engine] = parsed
    .slice(1)
    .map((r) => ({
      name: (r[nameIdx] || '').trim(),
      code: (r[codeIdx] || '').trim()
    }))
    .filter((x) => x.name && x.code);
}

const byLang = new Map();
const makeKey = (name) => name.toLowerCase();

for (const engine of Object.keys(engineData)) {
  for (const item of engineData[engine]) {
    const key = makeKey(item.name);
    if (!byLang.has(key)) {
      byLang.set(key, {
        name: item.name,
        codes: {
          google: new Set(),
          azure: new Set(),
          deepl: new Set(),
          nllb: new Set()
        }
      });
    }
    byLang.get(key).codes[engine].add(item.code);
  }
}

const rows = Array.from(byLang.values()).sort((a, b) => a.name.localeCompare(b.name));

const lines = [];
lines.push('# Supported Languages Matrix');
lines.push('');
lines.push('This table is generated from CSV source files in `src/data`: `google.csv`, `azure.csv`, `deepl.csv`, and `nllb.csv`.');
lines.push('');
lines.push('| Language name | google | azure | deepl | nllb |');
lines.push('|---|---|---|---|---|');

const joinCodes = (set) => Array.from(set).sort((a, b) => a.localeCompare(b)).join(' / ');
const esc = (v) => String(v || '').replace(/\|/g, '\\|');

for (const row of rows) {
  lines.push(
    `| ${esc(row.name)} | ${esc(joinCodes(row.codes.google))} | ${esc(joinCodes(row.codes.azure))} | ${esc(joinCodes(row.codes.deepl))} | ${esc(joinCodes(row.codes.nllb))} |`
  );
}

lines.push('');
lines.push(`Generated rows: ${rows.length}`);
lines.push('');

fs.writeFileSync(path.join(root, 'doc/SupportedLanguages.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(`Updated doc/SupportedLanguages.md with ${rows.length} rows.`);
