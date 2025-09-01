import dotenv from "dotenv"
dotenv.config();

import * as vscode from 'vscode';

export class MissingEnvVarError extends Error {
  constructor(public readonly varName: string) {
    super(`Environment variable "${varName}" is not set`);
    this.name = 'MissingEnvVarError';
  }
}

const warned = new Set<string>();

export function getEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    if (!warned.has(name)) {
      warned.add(name);
      vscode.window.showErrorMessage(`Translator: Environment variable "${name}" is not set. Configure it in your shell or .env file.`);
    }
    throw new MissingEnvVarError(name);
  }
  return val;
}

export function resolveEnvString(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const envRef = /^env:([A-Z0-9_]+)$/i.exec(v);
  if (envRef) return getEnv(envRef[1]);
  return v.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => getEnv(name));
}

export function resolveEnvDeep<T = any>(obj: T): T {
  if (obj == null || typeof obj !== 'object') return resolveEnvString(obj) as T;
  if (Array.isArray(obj)) return obj.map(resolveEnvDeep) as any;
  const out: any = {};
  for (const [k, v] of Object.entries(obj as any)) out[k] = resolveEnvDeep(v);
  return out as T;
}
