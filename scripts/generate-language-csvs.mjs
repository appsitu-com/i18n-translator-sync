import fs from 'node:fs/promises';
import path from 'node:path';
import { createSign } from 'node:crypto';

const root = process.cwd();
const translatorsDir = path.join(root, 'src', 'data');
const envPath = path.join(root, 'test-project', 'translator.env');
const nllbMapPath = path.join(root, 'src', 'translators', 'nllbLanguageMap.ts');

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

async function writeCsv(fileName, headers, rows) {
  const outPath = path.join(translatorsDir, fileName);
  await fs.writeFile(outPath, toCsv(headers, rows), 'utf8');
  return { outPath, count: rows.length };
}

async function buildGoogleCsv(env) {
  const keyPathRaw = env.GOOGLE_TRANSLATION_KEY;
  const projectId = env.GOOGLE_TRANSLATION_PROJECT_ID;
  if (!keyPathRaw || !projectId) {
    throw new Error('Missing GOOGLE_TRANSLATION_KEY or GOOGLE_TRANSLATION_PROJECT_ID in test-project/translator.env');
  }

  const keyPath = path.isAbsolute(keyPathRaw)
    ? keyPathRaw
    : path.resolve(path.dirname(envPath), keyPathRaw);
  const keyJson = JSON.parse(await fs.readFile(keyPath, 'utf8'));

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: keyJson.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-translation',
    aud: keyJson.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(keyJson.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const assertion = `${unsigned}.${signature}`;
  const tokenBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString();

  const tokenRes = await fetch(keyJson.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token request failed: ${tokenRes.status} ${tokenRes.statusText}`);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    throw new Error('Google token response missing access_token');
  }

  const langRes = await fetch(
    `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/global/supportedLanguages?display_language_code=en`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!langRes.ok) {
    throw new Error(`Google supportedLanguages request failed: ${langRes.status} ${langRes.statusText}`);
  }
  const langJson = await langRes.json();

  const rows = (langJson.languages || []).map((l) => ({
    language_name: l.displayName || '',
    language_code: l.languageCode || '',
    support_source: Boolean(l.supportSource),
    support_target: Boolean(l.supportTarget)
  }));

  rows.sort((a, b) => a.language_code.localeCompare(b.language_code));
  return writeCsv('google.csv', ['language_name', 'language_code', 'support_source', 'support_target'], rows);
}

async function buildAzureCsv() {
  const res = await fetch('https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation');
  if (!res.ok) {
    throw new Error(`Azure languages request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const entries = Object.entries(json.translation || {});
  const rows = entries.map(([code, meta]) => ({
    language_name: meta.name || '',
    native_name: meta.nativeName || '',
    language_code: code,
    dir: meta.dir || ''
  }));
  rows.sort((a, b) => a.language_code.localeCompare(b.language_code));
  return writeCsv('azure.csv', ['language_name', 'native_name', 'language_code', 'dir'], rows);
}

async function buildDeepLCsv(env) {
  const key = env.DEEPL_TRANSLATION_KEY;
  if (!key) {
    throw new Error('Missing DEEPL_TRANSLATION_KEY in test-project/translator.env');
  }

  const endpointBase = (env.DEEPL_TRANSLATION_URL || 'https://api-free.deepl.com').replace(/\/+$/, '');

  async function getList(type) {
    const url = `${endpointBase}/v2/languages?type=${type}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`
      }
    });
    if (!res.ok) {
      throw new Error(`DeepL languages (${type}) request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  const [source, target] = await Promise.all([getList('source'), getList('target')]);

  const byCode = new Map();
  for (const s of source) {
    byCode.set(s.language, {
      language_name: s.name || '',
      language_code: s.language,
      supports_source: true,
      supports_target: false
    });
  }
  for (const t of target) {
    const row = byCode.get(t.language) || {
      language_name: t.name || '',
      language_code: t.language,
      supports_source: false,
      supports_target: false
    };
    row.language_name = row.language_name || t.name || '';
    row.supports_target = true;
    byCode.set(t.language, row);
  }

  const rows = Array.from(byCode.values()).sort((a, b) => a.language_code.localeCompare(b.language_code));
  return writeCsv('deepl.csv', ['language_name', 'language_code', 'supports_source', 'supports_target'], rows);
}

async function buildNllbCsv() {
  const text = await fs.readFile(nllbMapPath, 'utf8');
  const start = text.indexOf('export const NLLB_LOCALE_TO_LANGUAGE_NAME');
  const open = text.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = text.slice(open + 1, end);
  const re = /'([^']+)'\s*:\s*'([^']*)'\s*,?/g;
  const rows = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    rows.push({
      language_name: m[2],
      language_code: m[1]
    });
  }
  rows.sort((a, b) => a.language_code.localeCompare(b.language_code));
  return writeCsv('nllb.csv', ['language_name', 'language_code'], rows);
}

async function main() {
  const envText = await fs.readFile(envPath, 'utf8');
  const env = parseEnv(envText);

  const results = [];
  results.push(await buildGoogleCsv(env));
  results.push(await buildAzureCsv());
  results.push(await buildDeepLCsv(env));
  results.push(await buildNllbCsv());

  for (const r of results) {
    console.log(`${path.basename(r.outPath)}: ${r.count} rows`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
