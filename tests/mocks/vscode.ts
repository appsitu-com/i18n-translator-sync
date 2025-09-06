import { get } from 'http'
import { vi } from 'vitest'

export const window = {
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn()
}

export const workspace = {
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    delete: vi.fn(),
    readDirectory: vi.fn(),
    createDirectory: vi.fn()
  },
  workspaceFolders: [],
  getWorkspaceFolder: vi.fn(),
  getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }),
  createFileSystemWatcher: () => watcher,
  onDidRenameFiles: vi.fn()
}

export const watcher = {
  onDidCreate: vi.fn(),
  onDidChange: vi.fn(),
  onDidDelete: vi.fn()
}

export const Uri = {
  file: (fsPath: string) => {
    const path = fsPath.replace(/\\/g, '/');
    return { fsPath, path } as any;
  },
  joinPath: (...parts: any[]) => {
    const fsPath = parts.map((p: any) => (typeof p === 'string' ? p : p.fsPath)).join('/');
    const path = parts.map((p: any) => (typeof p === 'string' ? p : p.path)).join('/');
    return { fsPath, path } as any;
  }
}

export const commands = { registerCommand: vi.fn() }

export default { window, workspace, Uri, commands }
