import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('extension startup gitignore handling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds translator.env and .translator to .gitignore on start', async () => {
    const appendFileSyncSpy = vi.fn()
    const existsSyncSpy = vi.fn((filePath: unknown) => {
      const normalized = String(filePath)
      if (normalized.endsWith('.gitignore')) {
        return true
      }
      if (normalized.endsWith('translator.env')) {
        return true
      }
      if (normalized.endsWith('translator.json')) {
        return true
      }
      return true
    })
    const readFileSyncSpy = vi.fn((filePath: unknown) => {
      const normalized = String(filePath)
      if (normalized.endsWith('.gitignore')) {
        return ''
      }
      if (normalized.endsWith('translator.env')) {
        return 'TEST_API_KEY=abcdef123456\n'
      }
      return ''
    })

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        existsSync: existsSyncSpy,
        readFileSync: readFileSyncSpy,
        appendFileSync: appendFileSyncSpy,
        writeFileSync: vi.fn(),
        copyFileSync: vi.fn()
      }
    })

    const vscode = await import('vscode')
    ;(vscode as any).ProgressLocation = { Notification: 1 }
    ;(vscode.window as any).withProgress = vi.fn(async (_options: any, task: any) => task({ report: vi.fn() }))

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('false'),
      update: vi.fn().mockResolvedValue(undefined)
    } as any)

    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as any)
    vi.mocked(vscode.window.showTextDocument).mockResolvedValue({} as any)
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any)
    vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    } as any)

    const adapter = {
      initializeOnActivation: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue({ initialized: true, ready: true, running: false }),
      isRunning: vi.fn().mockReturnValue(false),
      startWithContext: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn()
    }

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

    const extension = await import('../src/extension')

    const context = {
      subscriptions: [],
      extensionPath: '/mock/extension/path',
      extension: { packageJSON: { version: '0.0.0-test' } }
    } as any

    await extension.onStartTranslator(context)

    expect(existsSyncSpy).toHaveBeenCalled()
    expect(readFileSyncSpy).toHaveBeenCalled()

    const appendCalls = appendFileSyncSpy.mock.calls as Array<[string, string]>
    const appendedEntries = appendCalls.map((call) => call[1])

    expect(appendCalls.every((call) => call[0].endsWith('.gitignore'))).toBe(true)
    expect(appendedEntries.some((entry) => entry.includes('translator.env'))).toBe(true)
    expect(appendedEntries.some((entry) => entry.includes('.translator/'))).toBe(true)
  })
})
