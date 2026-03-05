import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createAdapterMock = () => ({
  initializeOnActivation: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue({ initialized: true, ready: true, running: false }),
  isRunning: vi.fn().mockReturnValue(false),
  purge: vi.fn().mockResolvedValue({
    deletedCount: 2,
    backupPath: '/ws/translator-20260305-1200.csv'
  }),
  dispose: vi.fn()
})

describe('extension purge command', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs purge when command is confirmed', async () => {
    const vscode = await import('vscode')
    ;(vscode as any).ProgressLocation = { Notification: 1 }
    ;(vscode.window as any).withProgress = vi.fn(async (_options: any, task: any) => {
      return task({ report: vi.fn() })
    })
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('ask'),
      update: vi.fn().mockResolvedValue(undefined)
    } as any)
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    } as any)

    const adapter = createAdapterMock()

    vi.doMock('../src/vscode/vscodeAdapter', () => ({
      VSCodeTranslatorAdapter: vi.fn().mockImplementation(() => adapter)
    }))

    vi.doMock('../src/vscode/statusBar', () => ({
      VSCodeStatusBarManager: vi.fn().mockImplementation(() => ({
        create: vi.fn(),
        updateStatus: vi.fn(),
        dispose: vi.fn()
      }))
    }))

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Purge' as any)

    const extension = await import('../src/extension')
    const context = {
      subscriptions: [],
      extensionPath: '/mock/extension/path',
      extension: { packageJSON: { version: '0.0.0-test' } }
    } as any

    await extension.activate(context)

    const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
      call => call[0] === 'translator.purgeCache'
    )

    expect(commandCall).toBeDefined()
    await (commandCall?.[1] as any)()

    expect(adapter.purge).toHaveBeenCalledTimes(1)
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Purged 2 unused translations.')
    )

    extension.deactivate()
  })

  it('does not run purge when confirmation is cancelled', async () => {
    const vscode = await import('vscode')
    ;(vscode as any).ProgressLocation = { Notification: 1 }
    ;(vscode.window as any).withProgress = vi.fn(async (_options: any, task: any) => {
      return task({ report: vi.fn() })
    })
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('ask'),
      update: vi.fn().mockResolvedValue(undefined)
    } as any)
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    } as any)

    const adapter = createAdapterMock()

    vi.doMock('../src/vscode/vscodeAdapter', () => ({
      VSCodeTranslatorAdapter: vi.fn().mockImplementation(() => adapter)
    }))

    vi.doMock('../src/vscode/statusBar', () => ({
      VSCodeStatusBarManager: vi.fn().mockImplementation(() => ({
        create: vi.fn(),
        updateStatus: vi.fn(),
        dispose: vi.fn()
      }))
    }))

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as any)

    const extension = await import('../src/extension')
    const context = {
      subscriptions: [],
      extensionPath: '/mock/extension/path',
      extension: { packageJSON: { version: '0.0.0-test' } }
    } as any

    await extension.activate(context)

    const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
      call => call[0] === 'translator.purgeCache'
    )

    expect(commandCall).toBeDefined()
    await (commandCall?.[1] as any)()

    expect(adapter.purge).not.toHaveBeenCalled()

    extension.deactivate()
  })
})
