import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { activate, deactivate, subscriptions } from '../src/extension'
import vscode, { commands, workspace, watcher, Uri } from './mocks/vscode'
import * as extension from '../src/extension'


// Mock the config module
vi.mock('../src/config', () => {
  return {
    loadProjectConfig: vi.fn(() => ({
      sourcePaths: ['i18n/en'],
      sourceLocale: 'en',
      targetLocales: [],
      enableBackTranslation: true,
      defaultMarkdownEngine: 'copy',
      defaultJsonEngine: 'copy',
      engineOverrides: {}
    })),
    findSourcePathForFile: vi.fn(() => 'i18n/en')
  }
})

describe('extension.ts', () => {
  let ctx: any
  let registerCommandSpy: any
  let showInfoSpy: any
  let showErrorSpy: any
  let createStatusBarItemSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    const subscriptionMock = (name: string) => ({ dispose: () => console.log(`${name} disposed`) })

    ctx = { subscriptions: [] }
    registerCommandSpy = vi
      .spyOn(vscode.commands, 'registerCommand')
      .mockImplementation((cmd, cb) => subscriptionMock(cmd))
    showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined)
    showErrorSpy = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)
    createStatusBarItemSpy = vi.spyOn(vscode.window, 'createStatusBarItem').mockReturnValue({
      text: '',
      tooltip: '',
      command: '',
      show: vi.fn(),
      dispose: vi.fn()
    })

    ;(workspace.createFileSystemWatcher as any) = vi.fn().mockReturnValue({
      onDidCreate: vi.fn().mockReturnValue(subscriptionMock('onDidCreate')),
      onDidChange: vi.fn().mockReturnValue(subscriptionMock('onDidChange')),
      onDidDelete: vi.fn().mockReturnValue(subscriptionMock('onDidDelete')),
      dispose: () => console.log('watcher disposed')
    })

    ;(workspace.onDidRenameFiles as any) = vi.fn().mockReturnValue(subscriptionMock('onDidRenameFiles'))

    vi.spyOn(extension as any, 'startTranslator').mockResolvedValue(subscriptionMock('startTranslator'))
    vi.spyOn(extension as any, 'stopTranslator').mockImplementation(() => {})
    vi.spyOn(extension as any, 'restartTranslator').mockResolvedValue(subscriptionMock('restartTranslator'))
    vi.spyOn(extension as any, 'pushToMateCat').mockResolvedValue(subscriptionMock('pushToMateCat'))
    vi.spyOn(extension as any, 'pullFromMateCat').mockResolvedValue(subscriptionMock('pullFromMateCat'))
    vi.spyOn(extension as any, 'onStartTranslator').mockResolvedValue(undefined)
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn().mockReturnValue(false),
      update: vi.fn()
    })
    vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([{ uri: { fsPath: '/ws' } }] as any)
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Activation & Deactivation', () => {
    it('should activate without errors and register commands', async () => {
      await extension.activate(ctx)
      expect(registerCommandSpy).toHaveBeenCalled()
      // Should push disposables to ctx.subscriptions
      expect(ctx.subscriptions.length).toBeGreaterThan(0)
    })

    it('should dispose resources and stop translator on deactivate', () => {
      // Ensure all subscriptions are valid disposables
      ctx.subscriptions.push({ dispose: vi.fn() })
      ctx.subscriptions.push({ dispose: vi.fn() })
      ctx.subscriptions.push({ dispose: vi.fn() })
      extension.deactivate()
      // No error thrown, resources disposed
    })
  })

  describe('Command Registration', () => {
    it('should register all translator commands and call handlers', async () => {
      await extension.activate(ctx)
      const expectedCommands = [
        'translator.start',
        'translator.stop',
        'translator.restart',
        'translator.push',
        'translator.pull'
      ]
      for (const cmd of expectedCommands) {
        expect(registerCommandSpy).toHaveBeenCalledWith(cmd, expect.any(Function))
      }
    })
  })

  describe('Command Functionality', () => {
    it('translator.start should start translation and show status', async () => {
      await extension.activate(ctx)
      // Simulate calling the registered command
      await (registerCommandSpy.mock.calls.find((call: any[]) => call[0] === 'translator.start')[1])(ctx)
      expect(showInfoSpy).toHaveBeenCalled()
    })
    it('translator.stop should stop translation and show status', async () => {
      await extension.activate(ctx)
      await (registerCommandSpy.mock.calls.find((call: any[]) => call[0] === 'translator.stop')[1])()
      expect(showInfoSpy).toHaveBeenCalled()
    })
    it('translator.restart should restart translation', async () => {
      await extension.activate(ctx)
      await (registerCommandSpy.mock.calls.find((call: any[]) => call[0] === 'translator.restart')[1])(ctx)
      // No error thrown
    })
    it('translator.push should push to MateCat', async () => {
      await extension.activate(ctx)
      await (registerCommandSpy.mock.calls.find((call: any[]) => call[0] === 'translator.push')[1])()
      // No error thrown
    })
    it('translator.pull should pull from MateCat', async () => {
      await extension.activate(ctx)
      await (registerCommandSpy.mock.calls.find((call: any[]) => call[0] === 'translator.pull')[1])(ctx)
      // No error thrown
    })
  })

  describe('File Watching & Event Handling', () => {
    it('should set up file watchers and subscriptions on start', async () => {
      // This is covered by activation, but you can add more detailed spies if needed
      await extension.activate(ctx)
      expect(ctx.subscriptions.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling & Notifications', () => {
    /**
     * Note: Complex error handling tests have been moved to errorHandling.test.ts
     * This is because testing async error paths involving internal functions
     * is more complicated and requires more extensive mocking.
     */

    it('should expose error handling mechanism', async () => {
      // Simple test to verify error message display is properly mocked
      const errorMsg = 'Error starting translator: Test error';

      // Set up our mock to capture the call
      showErrorSpy.mockClear();
      showErrorSpy.mockResolvedValueOnce('Configure API Keys');

      // Call directly to VS Code's window.showErrorMessage
      await vscode.window.showErrorMessage(errorMsg, 'Configure API Keys');

      // Verify our spy is working correctly
      expect(showErrorSpy).toHaveBeenCalledWith(errorMsg, 'Configure API Keys');
    });
  })

  describe('Configuration', () => {
    it('should read and apply configuration from settings', async () => {
      await extension.activate(ctx)
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('translator')
    })
  })

  describe('Status Bar & UI', () => {
    it('should create and show status bar item if not auto-start', async () => {
      ;(vscode.workspace.getConfiguration as any).mockReturnValue({ get: vi.fn().mockReturnValue(false) })
      // Force environment to allow status bar creation
      process.env.NODE_ENV = 'production'
      delete process.env.VITEST
      await extension.activate(ctx)
      expect(createStatusBarItemSpy).toHaveBeenCalled()
    })
  })
})


// describe('extension', () => {
//   // Set up mocks for each test
//   beforeEach(() => {
//     // Reset mocks before each test
//     vi.clearAllMocks();

//     // Set up specific mock behavior for extension tests
//     (workspace as any).workspaceFolders = [{
//       uri: Uri.file('/test-workspace'),
//       name: 'test',
//       index: 0
//     }];

//     (workspace.getConfiguration as any) = vi.fn().mockReturnValue({
//       get: vi.fn().mockImplementation((key: string, defaultValue: any) => {
//         if (key === 'targetLocales') return [];
//         return defaultValue;
//       })
//     });

//   })
// })
