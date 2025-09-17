import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SQLiteCache } from './cache.sqlite';
import { resolveEnvDeep } from './core/util/env';
import { VSCodeLogger } from './vscode/logger';

type MateCatSettings = {
  pushUrl: string;   // e.g., https://matecat.example/api/projects/{projectId}/files
  pullUrl: string;   // e.g., https://matecat.example/api/projects/{projectId}/files/{fileId}/download
  apiKey?: string;   // optional header: Authorization: Bearer <apiKey>
  projectId?: string;
  pullMethod?: 'GET' | 'POST';
  extraHeaders?: Record<string,string>;
};

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('translator');
}

function getMateCatSettings(): MateCatSettings {
  const raw = cfg().get<any>('matecat', {});
  // Create a temporary logger for resolving env vars
  const outputChannel = vscode.window.createOutputChannel('MateCat');
  const logger = new VSCodeLogger(outputChannel);
  return resolveEnvDeep<MateCatSettings>(raw, logger);
}

async function exportCacheCsv(cache: SQLiteCache, tmpDir?: string): Promise<string> {
  const dir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'matecat-'));
  const csvPath = path.join(dir, 'translations.csv');
  await cache.exportCSV(csvPath);
  return csvPath;
}

function fillTemplate(url: string, vars: Record<string,string|undefined>) {
  return url.replace(/\{(\w+)\}/g, (_,k) => (vars[k] ?? ''));
}

export async function pushCacheToMateCat(cache: SQLiteCache): Promise<void> {
  const s = getMateCatSettings();
  if (!s.pushUrl) throw new Error('MateCat pushUrl not configured. Set translator.matecat.pushUrl');

  const vars = { projectId: s.projectId };
  const url = fillTemplate(s.pushUrl, vars);

  const csv = await exportCacheCsv(cache);
  const boundary = `----mcform${Math.random().toString(16).slice(2)}`;
  const bodyParts: any[] = [];
  const append = (chunk: string | Buffer) => bodyParts.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);

  append(`--${boundary}\r\n`);
  append(`Content-Disposition: form-data; name="file"; filename="translations.csv"\r\n`);
  append(`Content-Type: text/csv\r\n\r\n`);
  append(fs.readFileSync(csv));
  append(`\r\n--${boundary}--\r\n`);

  const headers: Record<string,string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  };
  if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}`;
  if (s.extraHeaders) Object.assign(headers, s.extraHeaders);

  const res = await fetch(url, { method: 'POST', headers, body: Buffer.concat(bodyParts) as any });
  const txt = await res.text();
  if (!res.ok) throw new Error(`MateCat push failed: ${res.status} ${res.statusText} ${txt}`);

  vscode.window.showInformationMessage('MateCat: CSV cache pushed for review.');
}

export async function pullReviewedFromMateCat(cache: SQLiteCache): Promise<number> {
  const s = getMateCatSettings();
  if (!s.pullUrl) throw new Error('MateCat pullUrl not configured. Set translator.matecat.pullUrl');

  const vars = { projectId: s.projectId };
  const url = fillTemplate(s.pullUrl, vars);
  const headers: Record<string,string> = {};
  if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}`;
  if (s.extraHeaders) Object.assign(headers, s.extraHeaders);

  const res = await fetch(url, { method: s.pullMethod ?? 'GET', headers });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    const t = buf.toString('utf8');
    throw new Error(`MateCat pull failed: ${res.status} ${res.statusText} ${t}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matecat-'));
  const csvPath = path.join(tmp, 'reviewed.csv');
  fs.writeFileSync(csvPath, buf);

  const imported = await cache.importCSV(csvPath);
  vscode.window.showInformationMessage(`MateCat: imported ${imported} reviewed translations.`);
  return imported;
}
