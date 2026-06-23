import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const FIXTURE_ROOT = path.join(REPO_ROOT, 'test-project', 'fixtures', 'purge-api-repro-v1')

async function createFixtureWorkspace(): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'i18n-purge-fixture-'))
  await cp(FIXTURE_ROOT, tempDir, { recursive: true })
  return tempDir
}

describe('integration: CLI purge command on purge fixture', () => {
  const originalArgv = process.argv
  let workspacePath = ''

  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    workspacePath = await createFixtureWorkspace()
    process.argv = ['node', 'cli', workspacePath, '--purge-cache']
  })

  afterEach(async () => {
    process.argv = originalArgv
    vi.restoreAllMocks()
    vi.resetModules()

    if (workspacePath) {
      await rm(workspacePath, { recursive: true, force: true })
    }
  })

  it('runs purge end-to-end for the v1 JSONL fixture without outbound API calls', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Unexpected network request during purge fixture test')
    })

    const { runCli } = await import('../../src/cli/main')

    await expect(runCli()).resolves.toBeUndefined()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
