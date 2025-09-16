import { get } from 'http'
import { vi } from 'vitest'

// Add missing VS Code enums for tests
export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export const window = {
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  createStatusBarItem: vi.fn().mockReturnValue({
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    dispose: vi.fn()
  }),
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn((msg) => console.log(msg)), // Log to console during tests
    append: vi.fn((msg) => process.stdout.write(msg)),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn()
  })
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
