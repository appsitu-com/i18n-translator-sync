import { beforeEach, describe, expect, it, vi } from 'vitest'

type AutoStartValue = 'ask' | 'true' | 'false'

const AUTO_START_PROMPT =
  'Do you want to automatically start the translator whenever you open this workspace?'

async function loadExtensionWithAutoStart(autoStart: AutoStartValue) {
  vi.resetModules()

  const vscode = await import('vscode')
  ;(vscode as any).ConfigurationTarget = { Workspace: 2 }

  const configGet = vi.fn().mockReturnValue(autoStart)
  const configUpdate = vi.fn().mockResolvedValue(undefined)

  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: configGet,
    update: configUpdate
  } as any)

  vi.mocked(vscode.window.createOutputChannel).mockReturnValue({
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn()
  } as any)

  const adapter = {
    initializeOnActivation: vi.fn().mockResolvedValue(undefined),
    startWithContext: vi.fn().mockResolvedValue(undefined),
    restartWithContext: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    pushToMateCat: vi.fn().mockResolvedValue(undefined),
    pullFromMateCat: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ initialized: true, ready: true, running: false }),
    isRunning: vi.fn().mockReturnValue(false),
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

  return { vscode, extension, context, adapter, configGet, configUpdate }
}

describe('extension autoStart behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not prompt or update workspace settings during activation when autoStart is ask', async () => {
    const { vscode, extension, context, configUpdate } = await loadExtensionWithAutoStart('ask')

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any)

    await extension.activate(context)
    await Promise.resolve()
    await Promise.resolve()

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(AUTO_START_PROMPT, 'Yes', 'No')
    expect(configUpdate).not.toHaveBeenCalled()
  })

  it('prompts on first manual start when autoStart is ask and persists true when user chooses Yes', async () => {
    const { vscode, extension, context, adapter, configUpdate } = await loadExtensionWithAutoStart('ask')

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Yes' as any)

    await extension.onStartTranslator(context)

    expect(adapter.startWithContext).toHaveBeenCalledWith(context)
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(AUTO_START_PROMPT, 'Yes', 'No')
    expect(configUpdate).toHaveBeenCalledWith('autoStart', 'true', (vscode as any).ConfigurationTarget.Workspace)
  })

  it('prompts on first manual start when autoStart is ask and persists false when user chooses No', async () => {
    const { vscode, extension, context, configUpdate } = await loadExtensionWithAutoStart('ask')

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('No' as any)

    await extension.onStartTranslator(context)

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(AUTO_START_PROMPT, 'Yes', 'No')
    expect(configUpdate).toHaveBeenCalledWith('autoStart', 'false', (vscode as any).ConfigurationTarget.Workspace)
  })

  it('does not prompt or update when autoStart is false and user manually starts translator', async () => {
    const { vscode, extension, context, adapter, configUpdate } = await loadExtensionWithAutoStart('false')

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any)

    await extension.onStartTranslator(context)

    expect(adapter.startWithContext).toHaveBeenCalledWith(context)
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(AUTO_START_PROMPT, 'Yes', 'No')
    expect(configUpdate).not.toHaveBeenCalled()
  })
})
