import * as path from 'path'
import { it, vi, expect, beforeEach, afterEach } from 'vitest'
import { processFileForLocales, removeFileForLocales } from '../src/pipeline'
import { workspace, Uri } from './mocks/vscode'
import { registerAllTranslators } from '../src/translators'
import { SQLiteCache } from '../src/cache.sqlite'
import { loadProjectConfig } from '../src/config'

vi.mock('../src/cache.sqlite', async () => {
  const mod = await vi.importActual<any>('../src/cache.sqlite')
  // Replace SQLiteCache with a minimal fake (no file IO)
  class FakeCache {
    getMany = vi.fn(async () => new Map())
    putMany = vi.fn(async () => {})
    exportCSV = vi.fn(async () => {})
    importCSV = vi.fn(async () => 0)
    close = vi.fn(() => {})
  }
  return { ...mod, SQLiteCache: FakeCache }
})

vi.mock('../src/config', () => {
  return {
    loadProjectConfig: vi.fn(() => ({
      sourceDir: '',
      targetDir: '',
      sourcePaths: ['i18n/en'],
      sourceLocale: 'en',
      targetLocales: ['fr-FR'],
      enableBackTranslation: true,
      defaultMarkdownEngine: 'copy',
      defaultJsonEngine: 'copy',
      engineOverrides: {}
    })),
    findSourcePathForFile: vi.fn(() => 'i18n/en'),
    containsLocale: vi.fn(() => true),
    replaceLocaleInPath: vi.fn((path, sourceLocale, targetLocale) =>
      path.replace(sourceLocale, targetLocale))
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  // workspace root and config
  ;(workspace.getConfiguration as any).mockReturnValue({
    get: (k: string, d: any) => {
      const m: any = {
        sourceLocale: 'en',
        targetLocales: ['fr-FR'],
        enableBackTranslation: true,
        defaultMarkdownEngine: 'copy',
        defaultJsonEngine: 'copy',
        engineOverrides: {}
      }
      return m[k] ?? d
    }
  })
  // mock FS read/write
  // (workspace.fs.readFile as any).mockReset()
  // (workspace.fs.writeFile as any).mockReset()
  // (workspace.fs.createDirectory as any).mockResolvedValue(void 0)
  // (workspace.fs.readDirectory as any).mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('processFileForLocales writes forward and back files', async () => {
  registerAllTranslators() // includes copy engine
  // pretend JSON file
  const src = Uri.file('/ws/i18n/en/demo.json')
  // Update the mock to include both path and fsPath properties
  ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
  ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })
  ;(workspace.fs.readFile as any).mockResolvedValueOnce(Buffer.from(JSON.stringify({ a: 'x' }), 'utf8'))

  const cache = new SQLiteCache(':memory:')
  await processFileForLocales(
    src,
    cache as any,
    { targetLocales: ['fr-FR'], sourceLocale: 'en', enableBackTranslation: true }
  )

  expect(workspace.fs.writeFile).toHaveBeenCalled()
  const calls = (workspace.fs.writeFile as any).mock.calls
  // two writes: forward and back
  expect(calls.length).toBe(2)
})

it('removeFileForLocales deletes forward and back files and prunes', async () => {
  const src = Uri.file('/ws/i18n/en/demo.json')
  ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
  ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })

  await removeFileForLocales(src)
  expect(workspace.fs.delete).toHaveBeenCalledTimes(2)
})
