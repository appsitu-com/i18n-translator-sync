import { describe, expect, it, vi } from 'vitest'
import { createMockFileSystem } from '../../mocks/filesystem'
import { MateCatReviewService } from '../../../src/core/review/mateCatReviewService'
import type { IConfigProvider } from '../../../src/core/coreConfig'
import type { ILogger } from '../../../src/core/util/baseLogger'
import type { ITranslationMemory } from '../../../src/core/tm/ITranslationMemory'

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

function createConfigProvider(): IConfigProvider {
  return {
    get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    update: vi.fn()
  }
}

function createTranslationMemoryMock(): ITranslationMemory {
  return {
    getMany: vi.fn().mockResolvedValue(new Map()),
    putMany: vi.fn().mockResolvedValue(undefined),
    exportCSV: vi.fn(),
    exportTMX: vi.fn().mockResolvedValue(0),
    exportXLIFF: vi.fn().mockResolvedValue(0),
    importCSV: vi.fn(),
    hasSourcePath: vi.fn(),
    hasPendingPurge: vi.fn(),
    purge: vi.fn(),
    completePurge: vi.fn(),
    isNew: vi.fn(),
    didMigrateFromV1: vi.fn(),
    clearMigrationFlag: vi.fn(),
    close: vi.fn()
  }
}

describe('MateCatReviewService', () => {
  it('imports reviewed XLIFF into translation memory during pull', async () => {
    const workspacePath = '/workspace'
    const pendingProjects = [
      {
        projectId: 'mc-1',
        projectPass: 'pass-1',
        createdAt: '2026-06-25T00:00:00.000Z'
      }
    ]

    const fileSystem = createMockFileSystem({
      [`${workspacePath}/.translator/review/pending-projects.json`]: JSON.stringify(pendingProjects),
      [`${workspacePath}/.translator/review/download/mc-1/reviewed.xliff`]: ''
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const mateCatService = {
      createReviewProject: vi.fn(),
      checkReviewProjectStatus: vi.fn().mockResolvedValue([
        { projectId: 'mc-1', status: 'completed' }
      ]),
      pullReviewedTranslations: vi.fn().mockResolvedValue([
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
        }
      ])
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, createConfigProvider(), {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: { project_name: 'Demo' }
      }),
      translationMemory
    })

    await service.pullReviewedProjects()

    expect(translationMemory.putMany).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: 'matecat',
        sourceLocale: 'en',
        targetLocale: 'fr',
        sourcePath: 'i18n/fr/messages.json',
        status: 'reviewed',
        origin: 'human'
      })
    )

    expect(fileSystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: `${workspacePath}/.translator/review/download/mc-1/reviewed.xliff` }),
      expect.stringContaining('<xliff version="1.2">')
    )
  })

  it('imports all reviewed XLIFF files returned for one completed project', async () => {
    const workspacePath = '/workspace'
    const pendingProjects = [
      {
        projectId: 'mc-1',
        projectPass: 'pass-1',
        createdAt: '2026-06-25T00:00:00.000Z'
      }
    ]

    const fileSystem = createMockFileSystem({
      [`${workspacePath}/.translator/review/pending-projects.json`]: JSON.stringify(pendingProjects)
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const mateCatService = {
      createReviewProject: vi.fn(),
      checkReviewProjectStatus: vi.fn().mockResolvedValue([
        { projectId: 'mc-1', status: 'completed' }
      ]),
      pullReviewedTranslations: vi.fn().mockResolvedValue([
        {
          projectId: 'mc-1',
          fileName: 'fr-1.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
        },
        {
          projectId: 'mc-1',
          fileName: 'fr-2.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="2">
        <source>Goodbye</source>
        <target>Au revoir</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
        }
      ])
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, createConfigProvider(), {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: { project_name: 'Demo' }
      }),
      translationMemory
    })

    await service.pullReviewedProjects()

    expect(translationMemory.putMany).toHaveBeenCalledTimes(2)
    expect(translationMemory.putMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceLocale: 'en', targetLocale: 'fr', status: 'reviewed', origin: 'human' })
    )
    expect(translationMemory.putMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceLocale: 'en', targetLocale: 'fr', status: 'reviewed', origin: 'human' })
    )
  })

  it('keeps a pending project open when another project is completed and pulled', async () => {
    const workspacePath = '/workspace'
    const pendingProjects = [
      {
        projectId: 'mc-1',
        projectPass: 'pass-1',
        createdAt: '2026-06-25T00:00:00.000Z'
      },
      {
        projectId: 'mc-2',
        projectPass: 'pass-2',
        createdAt: '2026-06-25T00:00:01.000Z'
      }
    ]

    const fileSystem = createMockFileSystem({
      [`${workspacePath}/.translator/review/pending-projects.json`]: JSON.stringify(pendingProjects)
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const mateCatService = {
      createReviewProject: vi.fn(),
      checkReviewProjectStatus: vi.fn().mockResolvedValue([
        { projectId: 'mc-1', status: 'completed' },
        { projectId: 'mc-2', status: 'in_progress' }
      ]),
      pullReviewedTranslations: vi.fn().mockResolvedValue([
        {
          projectId: 'mc-1',
          fileName: 'fr-1.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
        }
      ])
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, createConfigProvider(), {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: { project_name: 'Demo' }
      }),
      translationMemory
    })

    await service.pullReviewedProjects()

    expect(translationMemory.putMany).toHaveBeenCalledTimes(1)

    const pendingWriteCall = vi
      .mocked(fileSystem.writeFile)
      .mock.calls.find(([uri]) => uri.path === `${workspacePath}/.translator/review/pending-projects.json`)

    expect(pendingWriteCall).toBeDefined()
    expect(pendingWriteCall?.[1]).toContain('mc-2')
  })

  it('does not close pending projects when reviewed file download fails', async () => {
    const workspacePath = '/workspace'
    const pendingProjects = [
      {
        projectId: 'mc-1',
        projectPass: 'pass-1',
        createdAt: '2026-06-25T00:00:00.000Z'
      }
    ]

    const fileSystem = createMockFileSystem({
      [`${workspacePath}/.translator/review/pending-projects.json`]: JSON.stringify(pendingProjects)
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const mateCatService = {
      createReviewProject: vi.fn(),
      checkReviewProjectStatus: vi.fn().mockResolvedValue([
        { projectId: 'mc-1', status: 'completed' }
      ]),
      pullReviewedTranslations: vi.fn().mockRejectedValue(new Error('download failed'))
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, createConfigProvider(), {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: { project_name: 'Demo' }
      }),
      translationMemory
    })

    await expect(service.pullReviewedProjects()).rejects.toThrow('download failed')

    const pendingReadCall = vi
      .mocked(fileSystem.readFile)
      .mock.calls.find(([uri]) => uri.path === `${workspacePath}/.translator/review/pending-projects.json`)

    expect(pendingReadCall).toBeDefined()
    expect(translationMemory.putMany).not.toHaveBeenCalled()
    expect(fileSystem.writeFile).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: `${workspacePath}/.translator/review/pending-projects.json` }),
      expect.any(String)
    )
  })
})