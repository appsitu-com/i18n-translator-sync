import * as vscode from 'vscode';
import { FileSystem, IUri } from '../core/util/fs';

/**
 * VSCode URI wrapper for core URI interface
 */
export class VSCodeUri implements IUri {
  constructor(public readonly uri: vscode.Uri) {}

  get fsPath(): string {
    return this.uri.fsPath;
  }

  get scheme(): string {
    return this.uri.scheme;
  }

  get path(): string {
    return this.uri.path;
  }

  toString(): string {
    return this.uri.toString();
  }
}

/**
 * Convert VS Code URI to our IUri interface
 */
export function toIUri(uri: vscode.Uri): IUri {
  return new VSCodeUri(uri);
}

/**
 * Convert our IUri interface to VS Code URI
 */
export function toVSCodeUri(uri: IUri): vscode.Uri {
  return uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
}

/**
 * VSCode file system implementation
 */
export class VSCodeFileSystem implements FileSystem {
  async readFile(uri: IUri): Promise<string> {
    const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
    const bytes = await vscode.workspace.fs.readFile(vscodeUri);
    return new TextDecoder().decode(bytes);
  }

  async writeFile(uri: IUri, content: string): Promise<void> {
    const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
    await vscode.workspace.fs.writeFile(vscodeUri, Buffer.from(content));
  }

  async deleteFile(uri: IUri): Promise<void> {
    const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
    await vscode.workspace.fs.delete(vscodeUri);
  }

  async fileExists(uri: IUri): Promise<boolean> {
    try {
      const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
      await vscode.workspace.fs.stat(vscodeUri);
      return true;
    } catch {
      return false;
    }
  }

  async readDirectory(uri: IUri): Promise<{ name: string; isDirectory: boolean; }[]> {
    const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
    const entries = await vscode.workspace.fs.readDirectory(vscodeUri);
    return entries.map(([name, fileType]) => ({
      name,
      isDirectory: fileType === vscode.FileType.Directory
    }));
  }

  async createDirectory(uri: IUri): Promise<void> {
    const vscodeUri = uri instanceof VSCodeUri ? uri.uri : vscode.Uri.file(uri.fsPath);
    await vscode.workspace.fs.createDirectory(vscodeUri);
  }

  createUri(path: string): IUri {
    return new VSCodeUri(vscode.Uri.file(path));
  }

  joinPath(base: IUri, ...pathSegments: string[]): IUri {
    const vscodeUri = base instanceof VSCodeUri ? base.uri : vscode.Uri.file(base.fsPath);
    return new VSCodeUri(vscode.Uri.joinPath(vscodeUri, ...pathSegments));
  }
}

// Singleton instance for VS Code file system
export const vsCodeFileSystem = new VSCodeFileSystem();