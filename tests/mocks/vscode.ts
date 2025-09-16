import { get } from 'http'
import { vi } from 'vitest'

// Add missing VS Code enums for tests
export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
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
  }),
  createTextEditorDecorationType: vi.fn(),
  showTextDocument: vi.fn()
}

import { enhancedFileSystemMock } from './filesystem';

export const workspace = {
  fs: enhancedFileSystemMock,
  workspaceFolders: [{
    uri: { fsPath: '/test/workspace' },
    name: 'TestWorkspace',
    index: 0
  }],
  getWorkspaceFolder: vi.fn(),
  getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }),
  createFileSystemWatcher: () => watcher,
  onDidRenameFiles: vi.fn(),
  onDidChangeConfiguration: vi.fn(),
  openTextDocument: vi.fn().mockResolvedValue({})
}

export const watcher = {
  onDidCreate: vi.fn(),
  onDidChange: vi.fn(),
  onDidDelete: vi.fn()
}

export const Uri = {
  file: (fsPath: string) => {
    const path = fsPath.replace(/\\/g, '/');
    return { fsPath, path, scheme: 'file' } as any;
  },
  joinPath: (...parts: any[]) => {
    const fsPath = parts.map((p: any) => (typeof p === 'string' ? p : p.fsPath)).join('/');
    const path = parts.map((p: any) => (typeof p === 'string' ? p : p.path)).join('/');
    return { fsPath, path, scheme: 'file' } as any;
  },
  parse: vi.fn(uri => ({ fsPath: uri, path: uri, scheme: 'file' }))
}

export const commands = { registerCommand: vi.fn() }

export const languages = {
  createDiagnosticCollection: vi.fn()
}

export const EventEmitter = vi.fn().mockImplementation(() => ({
  event: {},
  fire: vi.fn()
}))

export const Position = vi.fn()
export const Range = vi.fn()
export const Disposable = {
  from: vi.fn()
}
export const ThemeColor = vi.fn()

export default { window, workspace, Uri, commands, FileType, StatusBarAlignment, languages, EventEmitter, Position, Range, Disposable, ThemeColor }
