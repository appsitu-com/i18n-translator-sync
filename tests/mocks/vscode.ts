import { get } from 'http'
import { vi } from 'vitest';

export const window = {
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn()
};
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
  createFileSystemWatcher: vi.fn(),
  onDidRenameFiles: vi.fn()
};
export const Uri = {
  file: (fsPath: string) => ({ fsPath, path: fsPath.replace(/\\/g, '/') } as any),
  joinPath: (...parts: any[]) => ({ fsPath: parts.map((p: any) => (typeof p === 'string' ? p : p.fsPath)).join('/'),
                                    path: parts.map((p: any) => (typeof p === 'string' ? p : p.path)).join('/')} as any)
};
export const commands = { registerCommand: vi.fn() };
export default { window, workspace, Uri, commands };
