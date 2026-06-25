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
  it('builds fallback project_name from package.json name and target locales when missing', async () => {
    const workspacePath = '/workspace'
    const fileSystem = createMockFileSystem({
      [`${workspacePath}/package.json`]: JSON.stringify({ name: '@appsitu-com/i18n-translator-sync' }),
      [`${workspacePath}/review.xliff`]: '<xliff version="1.2"></xliff>',
      [`${workspacePath}/.translator/review/pending-projects.json`]: '[]'
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const configProvider: IConfigProvider = {
      get: vi.fn((section: string, defaultValue?: unknown) => {
        if (section === 'translator.targetLocales') return ['fr']
        return defaultValue
      }),
      update: vi.fn()
    }

    const mateCatService = {
      createReviewProject: vi.fn().mockResolvedValue({ projectId: 'mc-1', projectPass: 'pass-1' }),
      checkReviewProjectStatus: vi.fn(),
      pullReviewedTranslations: vi.fn()
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, configProvider, {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: {}
      }),
      translationMemory
    })

    await service.pushReviewProject({
      targetLocale: 'fr',
      artifacts: [
        {
          filePath: `${workspacePath}/review.xliff`,
          fileName: 'review.xliff',
          contentType: 'application/xliff+xml'
        }
      ]
    })

    expect(mateCatService.createReviewProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          source_lang: 'en',
          target_lang: 'fr',
          project_name: 'appsitu-com-i18n-translator-sync-fr'
        })
      })
    )
  })

  it('keeps configured project_name from MateCat settings when provided', async () => {
    const workspacePath = '/workspace'
    const fileSystem = createMockFileSystem({
      [`${workspacePath}/package.json`]: JSON.stringify({ name: '@appsitu-com/i18n-translator-sync' }),
      [`${workspacePath}/review.xliff`]: '<xliff version="1.2"></xliff>',
      [`${workspacePath}/.translator/review/pending-projects.json`]: '[]'
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const configProvider: IConfigProvider = {
      get: vi.fn((section: string, defaultValue?: unknown) => {
        if (section === 'translator.targetLocales') return ['de']
        return defaultValue
      }),
      update: vi.fn()
    }

    const mateCatService = {
      createReviewProject: vi.fn().mockResolvedValue({ projectId: 'mc-2', projectPass: 'pass-2' }),
      checkReviewProjectStatus: vi.fn(),
      pullReviewedTranslations: vi.fn()
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, configProvider, {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: { project_name: 'ExplicitName' }
      }),
      translationMemory
    })

    await service.pushReviewProject({
      targetLocale: 'de',
      artifacts: [
        {
          filePath: `${workspacePath}/review.xliff`,
          fileName: 'review.xliff',
          contentType: 'application/xliff+xml'
        }
      ]
    })

    expect(mateCatService.createReviewProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          project_name: 'ExplicitName',
          target_lang: 'de'
        })
      })
    )
  })

  it('uses reviewer.project as fallback project_name prefix over package.json name', async () => {
    const workspacePath = '/workspace'
    const fileSystem = createMockFileSystem({
      [`${workspacePath}/package.json`]: JSON.stringify({ name: '@appsitu-com/i18n-translator-sync' }),
      [`${workspacePath}/review.xliff`]: '<xliff version="1.2"></xliff>',
      [`${workspacePath}/.translator/review/pending-projects.json`]: '[]'
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const configProvider: IConfigProvider = {
      get: vi.fn((section: string, defaultValue?: unknown) => {
        if (section === 'translator.targetLocales') return ['fr']
        if (section === 'translator.reviewer.project') return 'team-release'
        return defaultValue
      }),
      update: vi.fn()
    }

    const mateCatService = {
      createReviewProject: vi.fn().mockResolvedValue({ projectId: 'mc-3', projectPass: 'pass-3' }),
      checkReviewProjectStatus: vi.fn(),
      pullReviewedTranslations: vi.fn()
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, configProvider, {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: {}
      }),
      translationMemory
    })

    await service.pushReviewProject({
      targetLocale: 'fr',
      artifacts: [
        {
          filePath: `${workspacePath}/review.xliff`,
          fileName: 'review.xliff',
          contentType: 'application/xliff+xml'
        }
      ]
    })

    expect(mateCatService.createReviewProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          project_name: 'team-release-fr'
        })
      })
    )
  })

  it('creates one project per target locale when multiple target locales are configured', async () => {
    const workspacePath = '/workspace'
    const fileSystem = createMockFileSystem({
      [`${workspacePath}/package.json`]: JSON.stringify({ name: 'i18n-translator-sync' }),
      [`${workspacePath}/.translator/review/fr/upload/review-fr.xliff`]: '<xliff version="1.2"></xliff>',
      [`${workspacePath}/.translator/review/de/upload/review-de.xliff`]: '<xliff version="1.2"></xliff>',
      [`${workspacePath}/.translator/review/pending-projects.json`]: '[]'
    })

    const logger = createLogger()
    const translationMemory = createTranslationMemoryMock()
    const configProvider: IConfigProvider = {
      get: vi.fn((section: string, defaultValue?: unknown) => {
        if (section === 'translator.targetLocales') return ['fr', 'de']
        return defaultValue
      }),
      update: vi.fn()
    }

    const mateCatService = {
      createReviewProject: vi.fn().mockResolvedValue({ projectId: 'mc-4', projectPass: 'pass-4' }),
      checkReviewProjectStatus: vi.fn(),
      pullReviewedTranslations: vi.fn()
    }

    const service = new MateCatReviewService(workspacePath, fileSystem, logger, configProvider, {
      createMateCatService: () => mateCatService,
      loadMateCatSettings: () => ({
        apiKey: 'secret',
        newProjectDefaults: {}
      }),
      translationMemory
    })

    await service.pushReviewProject({
      targetLocale: 'fr',
      artifacts: [
        {
          filePath: `${workspacePath}/.translator/review/fr/upload/review-fr.xliff`,
          fileName: 'review-fr.xliff',
          contentType: 'application/xliff+xml'
        }
      ]
    })

    expect(mateCatService.createReviewProject).toHaveBeenCalledTimes(1)
    expect(mateCatService.createReviewProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          target_lang: 'fr',
          project_name: 'i18n-translator-sync-fr'
        })
      })
    )
  })

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