import * as path from 'path'
import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest'
import { processFileForLocales, removeFileForLocales } from '../src/pipeline'
import { workspace, Uri } from './mocks/vscode'
import { registerAllTranslators } from '../src/translators'
import { SQLiteCache } from '../src/cache.sqlite'
import { pruneEmptyDirs } from '../src/pipeline'

describe('processFileForLocales', () => {
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
      replaceLocaleInPath: vi.fn((path, sourceLocale, targetLocale) => path.replace(sourceLocale, targetLocale))
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

  it('writes forward and back files for JSON', async () => {
    registerAllTranslators() // includes copy engine
    // pretend JSON file
    const src = Uri.file('/ws/i18n/en/demo.json')
    // Update the mock to include both path and fsPath properties
    ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
    ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })
    ;(workspace.fs.readFile as any).mockResolvedValueOnce(Buffer.from(JSON.stringify({ a: 'x' }), 'utf8'))

    const cache = new SQLiteCache(':memory:')
    await processFileForLocales(src, cache as any, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    expect(workspace.fs.writeFile).toHaveBeenCalled()
    const calls = (workspace.fs.writeFile as any).mock.calls
    // two writes: forward and back
    expect(calls).toHaveLength(2)
  })

  it('writes forward and back files for YAML', async () => {
    registerAllTranslators() // includes copy engine
    // pretend YAML file
    const src = Uri.file('/ws/i18n/en/demo.yaml')
    ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
    ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })
    ;(workspace.fs.readFile as any).mockResolvedValueOnce(Buffer.from('greeting: Hello\nfarewell: Goodbye', 'utf8'))

    const cache = new SQLiteCache(':memory:')
    await processFileForLocales(src, cache as any, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    expect(workspace.fs.writeFile).toHaveBeenCalled()
    const calls = (workspace.fs.writeFile as any).mock.calls
    // two writes: forward and back
    expect(calls).toHaveLength(2)
  })

  it('writes forward and back files for YML', async () => {
    registerAllTranslators() // includes copy engine
    // pretend YML file
    const src = Uri.file('/ws/i18n/en/demo.yml')
    ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
    ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })
    ;(workspace.fs.readFile as any).mockResolvedValueOnce(Buffer.from('greeting: Hello\nfarewell: Goodbye', 'utf8'))

    const cache = new SQLiteCache(':memory:')
    await processFileForLocales(src, cache as any, {
      targetLocales: ['fr-FR'],
      sourceLocale: 'en',
      enableBackTranslation: true
    })

    expect(workspace.fs.writeFile).toHaveBeenCalled()
    const calls = (workspace.fs.writeFile as any).mock.calls
    // two writes: forward and back
    expect(calls).toHaveLength(2)
  })
})

describe('removeFileForLocales', () => {
  it('deletes forward and back files and prunes', async () => {
    const src = Uri.file('/ws/i18n/en/demo.json')
    ;(workspace.workspaceFolders as any) = [{ uri: { path: '/ws', fsPath: '/ws' } }]
    ;(workspace.getWorkspaceFolder as any) = () => ({ uri: { path: '/ws', fsPath: '/ws' } })

    await removeFileForLocales(src)
    expect(workspace.fs.delete).toHaveBeenCalledTimes(2)
  })
})

describe('pruneEmptyDirs', () => {
  const root = Uri.file('/ws/i18n/fr-FR')
  const relPath = 'foo/bar/baz.txt'
  const dirs = ['/ws/i18n/fr-FR/foo/bar', '/ws/i18n/fr-FR/foo', '/ws/i18n/fr-FR']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prunes all empty directories up to root', async () => {
    // All directories are empty
    ;(workspace.fs.readDirectory as any)
      .mockResolvedValueOnce([]) // bar
      .mockResolvedValueOnce([]) // foo
    const deleteMock = (workspace.fs.delete as any).mockResolvedValue(undefined)

    await pruneEmptyDirs(root, relPath)

    expect(deleteMock).toHaveBeenCalledTimes(2)
    expect(deleteMock.mock.calls[0][0].fsPath).toBe(dirs[0])
    expect(deleteMock.mock.calls[1][0].fsPath).toBe(dirs[1])
  })

  it('stops pruning at first non-empty directory', async () => {
    // bar is empty, foo is not
    ;(workspace.fs.readDirectory as any)
      .mockResolvedValueOnce([]) // bar
      .mockResolvedValueOnce([['file.txt', 1]]) // foo not empty
    const deleteMock = (workspace.fs.delete as any).mockResolvedValue(undefined)

    await pruneEmptyDirs(root, relPath)

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock.mock.calls[0][0].fsPath).toBe(dirs[0])
  })

  it('handles non-existent directories gracefully', async () => {
    // bar does not exist
    ;(workspace.fs.readDirectory as any).mockRejectedValueOnce(new Error('not found'))
    const deleteMock = (workspace.fs.delete as any).mockResolvedValue(undefined)

    await pruneEmptyDirs(root, relPath)

    expect(deleteMock).not.toHaveBeenCalled()
  })
})
