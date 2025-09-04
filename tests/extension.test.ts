import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { activate, deactivate } from '../src/extension'
import vscode, { commands, workspace, watcher, Uri } from './mocks/vscode'

describe('extension', () => {
  // Set up mocks for each test
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    (commands.registerCommand as any).mockClear();

    // Set up specific mock behavior for extension tests
    (workspace as any).workspaceFolders = [{
      uri: Uri.file('/test-workspace'),
      name: 'test',
      index: 0
    }];

    (workspace.createFileSystemWatcher as any) = vi.fn().mockReturnValue({
      onDidCreate: vi.fn().mockReturnValue({}),
      onDidChange: vi.fn().mockReturnValue({}),
      onDidDelete: vi.fn().mockReturnValue({})
    });

    (workspace.getConfiguration as any) = vi.fn().mockReturnValue({
      get: vi.fn().mockImplementation((key: string, defaultValue: any) => {
        if (key === 'targetLocales') return [];
        return defaultValue;
      })
    });

    (workspace.onDidRenameFiles as any) = vi.fn().mockReturnValue({});
  })

  afterAll(() => {
    vi.restoreAllMocks();
  })

  it('registers commands on activate', async () => {
    const ctx = { subscriptions: [] as any[] } as any
    await activate(ctx)
    // Five commands should be registered: start, stop, restart, push, pull
    expect(commands.registerCommand).toHaveBeenCalledTimes(5)
    expect(commands.registerCommand).toHaveBeenCalledWith('translator.start', expect.any(Function))
    expect(commands.registerCommand).toHaveBeenCalledWith('translator.stop', expect.any(Function))
    expect(commands.registerCommand).toHaveBeenCalledWith('translator.restart', expect.any(Function))
    expect(commands.registerCommand).toHaveBeenCalledWith('translator.push', expect.any(Function))
    expect(commands.registerCommand).toHaveBeenCalledWith('translator.pull', expect.any(Function))
  })

  it('deactivate()', () => {
    deactivate() // not testing much
  })
})
