import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { TranslatorManager } from '../../../src/core/TranslatorManager'
import type { IConfigProvider } from '../../../src/core/coreConfig'
import { JsonlTranslationMemory } from '../../../src/core/tm/JsonlTranslationMemory'
import { nodeFileSystem } from '../../../src/core/util/fs'
import type { ILogger } from '../../../src/core/util/baseLogger'
import type { IWorkspaceWatcher } from '../../../src/core/util/watcher'
import {
  type IMateCatCreatedProject,
  type IMateCatProjectRef,
  type IMateCatProjectStatus,
  type IMateCatPulledFile,
  type IMateCatReviewProjectRequest,
  type IMateCatService,
  type MateCatSettings
} from '../../../src/core/review/MateCatService'
import { MateCatReviewService } from '../../../src/core/review/mateCatReviewService'
import type { IReviewService } from '../../../src/core/review/reviewService'

type StoredProject = {
  projectId: string
  projectPass: string
  status: string
  uploads: IMateCatReviewProjectRequest['uploads']
}

class FakeRoundTripMateCatService implements IMateCatService {
  private readonly projects = new Map<string, StoredProject>()
  private projectCounter = 0
  private lastRequest: IMateCatReviewProjectRequest | undefined

  async createReviewProject(
    _settings: MateCatSettings,
    request: IMateCatReviewProjectRequest
  ): Promise<IMateCatCreatedProject> {
    this.projectCounter += 1
    const projectId = `fake-${this.projectCounter}`
    const projectPass = `pass-${this.projectCounter}`

    this.projects.set(projectId, {
      projectId,
      projectPass,
      status: 'in_progress',
      uploads: request.uploads
    })
    this.lastRequest = request

    return {
      projectId,
      projectPass
    }
  }

  async checkReviewProjectStatus(
    _settings: MateCatSettings,
    projects: IMateCatProjectRef[]
  ): Promise<IMateCatProjectStatus[]> {
    return projects.map((project) => ({
      projectId: project.projectId,
      status: this.projects.get(project.projectId)?.status ?? 'unknown'
    }))
  }

  async pullReviewedTranslations(
    _settings: MateCatSettings,
    projects: IMateCatProjectRef[]
  ): Promise<IMateCatPulledFile[]> {
    const pulledFiles: IMateCatPulledFile[] = []

    for (const project of projects) {
      const storedProject = this.projects.get(project.projectId)
      if (!storedProject || storedProject.status !== 'completed') {
        continue
      }

      for (const upload of storedProject.uploads) {
        pulledFiles.push({
          projectId: project.projectId,
          fileName: upload.fileName,
          content: this.buildReviewedContent(upload.content.toString('utf8'))
        })
      }
    }

    return pulledFiles
  }

  setProjectStatus(projectId: string, status: string): void {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`No project found for id ${projectId}`)
    }

    project.status = status
  }

  getProjectIds(): string[] {
    return Array.from(this.projects.keys())
  }

  getLastRequest(): IMateCatReviewProjectRequest | undefined {
    return this.lastRequest
  }

  private buildReviewedContent(content: string): string {
    return content.replace(/\(AI[^)]*\)/g, '(Human)')
  }
}

function createNoOpLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

function createNoOpWorkspaceWatcher(): IWorkspaceWatcher {
  return {
    createFileSystemWatcher: vi.fn(),
    onDidRenameFiles: vi.fn(),
    dispose: vi.fn()
  }
}

function createConfigProvider(): IConfigProvider {
  return {
    get: vi.fn((section: string, defaultValue?: unknown) => {
      if (section === 'translator.sourceLocale') {
        return 'en'
      }

      if (section === 'translator.targetLocales') {
        return ['fr']
      }

      return defaultValue
    }),
    update: vi.fn()
  }
}

function writeFile(workspacePath: string, relativePath: string, content: string): void {
  const absolutePath = path.join(workspacePath, relativePath)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, 'utf8')
}

function createUploadXliff(suffix: string = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour (AI${suffix})</target>
      </trans-unit>
      <trans-unit id="2">
        <source>Goodbye</source>
        <target>Au revoir (AI${suffix})</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
}

function createTranslatedFileContent(suffix: string = ''): string {
  return JSON.stringify({ greeting: `Bonjour (AI${suffix})`, farewell: `Au revoir (AI${suffix})` }, null, 2)
}

function createTranslationMemory(workspacePath: string, logger: ILogger): JsonlTranslationMemory {
  return new JsonlTranslationMemory(path.join(workspacePath, '.translator', 'translation.jsonl'), workspacePath, logger)
}

function createReviewService(
  workspacePath: string,
  fileSystem: ReturnType<typeof nodeFileSystem.constructor>,
  logger: ILogger,
  configProvider: IConfigProvider,
  translationMemory: JsonlTranslationMemory,
  mateCatService: FakeRoundTripMateCatService
): IReviewService {
  return new MateCatReviewService(workspacePath, fileSystem, logger, configProvider, {
    createMateCatService: () => mateCatService,
    translationMemory
  })
}

function createManager(
  workspacePath: string,
  logger: ILogger,
  translationMemory: JsonlTranslationMemory,
  reviewService: IReviewService
): TranslatorManager {
  return new TranslatorManager(
    nodeFileSystem,
    logger,
    translationMemory,
    workspacePath,
    createNoOpWorkspaceWatcher(),
    createConfigProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      createReviewService: () => reviewService
    }
  )
}

describe('Review round-trip (real XLIFF export/import flow)', () => {
  let workspacePath = ''
  let originalApiKey: string | undefined

  beforeEach(() => {
    originalApiKey = process.env.MATECAT_API_KEY
    process.env.MATECAT_API_KEY = 'roundtrip-test-key'
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-review-roundtrip-'))
    writeFile(
      workspacePath,
      'matecat.json',
      JSON.stringify({ newProjectDefaults: { project_name: 'RoundTrip' } }, null, 2)
    )
  })

  afterEach(() => {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true })
    }

    if (originalApiKey === undefined) {
      delete process.env.MATECAT_API_KEY
    } else {
      process.env.MATECAT_API_KEY = originalApiKey
    }
  })

  it('exports XLIFF, pulls reviewed XLIFF, imports reviewed TM rows, and preserves the downloaded review file', async () => {
    const logger = createNoOpLogger()
    const translationMemory = createTranslationMemory(workspacePath, logger)
    const fakeMateCatService = new FakeRoundTripMateCatService()
    const reviewService = createReviewService(
      workspacePath,
      nodeFileSystem,
      logger,
      createConfigProvider(),
      translationMemory,
      fakeMateCatService
    )
    const manager = createManager(workspacePath, logger, translationMemory, reviewService)

    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', createUploadXliff())
    writeFile(workspacePath, 'i18n/fr/messages.json', createTranslatedFileContent())

    await translationMemory.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [
        { src: 'Hello', dst: 'Bonjour (AI)', ctx: '1', pos: 1 },
        { src: 'Goodbye', dst: 'Au revoir (AI)', ctx: '2', pos: 2 }
      ]
    })

    const preview = await manager.getReviewPushPreview()
    expect(preview).toEqual({ translationCount: 2, artifactCount: 1 })

    await manager.pushReviewProject()

    const pushedRequest = fakeMateCatService.getLastRequest()
    expect(pushedRequest?.uploads).toHaveLength(1)
    expect(pushedRequest?.uploads[0]?.content.toString('utf8')).toContain('<trans-unit id="1">')
    expect(pushedRequest?.uploads[0]?.content.toString('utf8')).toContain('Bonjour (AI)')

    const [projectId] = fakeMateCatService.getProjectIds()
    expect(projectId).toBeDefined()
    if (!projectId) {
      throw new Error('Expected a pushed project id to be available')
    }

    fakeMateCatService.setProjectStatus(projectId, 'completed')

    const pending = await manager.getPendingReviewStatus()
    expect(pending).toEqual([{ projectId, status: 'completed' }])

    await manager.pullReviewedProjects()

    const lookup = await translationMemory.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello', 'Goodbye'],
      contexts: ['1', '2'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1, 2]
    })

    expect(lookup.get('Hello::1')).toEqual({ translation: 'Bonjour (Human)', textPos: 1 })
    expect(lookup.get('Goodbye::2')).toEqual({ translation: 'Au revoir (Human)', textPos: 2 })

    const tmDump = readFileSync(path.join(workspacePath, '.translator', 'translation.jsonl'), 'utf8')
    expect(tmDump).toContain('"status":"reviewed"')
    expect(tmDump).toContain('"origin":"human"')

    const downloadedXliff = readFileSync(
      path.join(workspacePath, '.translator', 'review', 'download', projectId, 'messages.xliff'),
      'utf8'
    )
    expect(downloadedXliff).toContain('Bonjour (Human)')
    expect(downloadedXliff).toContain('Au revoir (Human)')

    await translationMemory.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/other.json',
      status: 'final',
      origin: 'ai',
      updatedAt: Date.now() + 10_000,
      pairs: [
        { src: 'Hello', dst: 'Bonjour (AI v2)', ctx: 'alt-1', pos: 10 },
        { src: 'Goodbye', dst: 'Au revoir (AI v2)', ctx: 'alt-2', pos: 20 }
      ]
    })

    const fallbackLookup = await translationMemory.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello', 'Goodbye'],
      contexts: ['1', '2'],
      sourcePath: 'i18n/fr/new-context.json',
      positions: [1, 2]
    })

    expect(fallbackLookup.get('Hello::1')?.translation).toBe('Bonjour (Human)')
    expect(fallbackLookup.get('Goodbye::2')?.translation).toBe('Au revoir (Human)')

    expect(await manager.getPendingReviewStatus()).toEqual([])
  })

  it('leaves the TM unchanged when no reviewed project is completed', async () => {
    const logger = createNoOpLogger()
    const translationMemory = createTranslationMemory(workspacePath, logger)
    const fakeMateCatService = new FakeRoundTripMateCatService()
    const reviewService = createReviewService(
      workspacePath,
      nodeFileSystem,
      logger,
      createConfigProvider(),
      translationMemory,
      fakeMateCatService
    )
    const manager = createManager(workspacePath, logger, translationMemory, reviewService)

    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', createUploadXliff())
    writeFile(workspacePath, 'i18n/fr/messages.json', createTranslatedFileContent())

    await translationMemory.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [
        { src: 'Hello', dst: 'Bonjour (AI)', ctx: '1', pos: 1 },
        { src: 'Goodbye', dst: 'Au revoir (AI)', ctx: '2', pos: 2 }
      ]
    })

    await manager.pushReviewProject()
    await manager.pullReviewedProjects()

    const lookup = await translationMemory.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello', 'Goodbye'],
      contexts: ['1', '2'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1, 2]
    })

    expect(lookup.get('Hello::1')).toEqual({ translation: 'Bonjour (AI)', textPos: 1 })
    expect(lookup.get('Goodbye::2')).toEqual({ translation: 'Au revoir (AI)', textPos: 2 })
  })

  it('supports a second review cycle without duplicating or corrupting TM rows', async () => {
    const logger = createNoOpLogger()
    const translationMemory = createTranslationMemory(workspacePath, logger)
    const fakeMateCatService = new FakeRoundTripMateCatService()
    const reviewService = createReviewService(
      workspacePath,
      nodeFileSystem,
      logger,
      createConfigProvider(),
      translationMemory,
      fakeMateCatService
    )
    const manager = createManager(workspacePath, logger, translationMemory, reviewService)

    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', createUploadXliff())
    writeFile(workspacePath, 'i18n/fr/messages.json', createTranslatedFileContent())

    await translationMemory.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [
        { src: 'Hello', dst: 'Bonjour (AI)', ctx: '1', pos: 1 },
        { src: 'Goodbye', dst: 'Au revoir (AI)', ctx: '2', pos: 2 }
      ]
    })

    await manager.pushReviewProject()

    const [firstProjectId] = fakeMateCatService.getProjectIds()
    if (!firstProjectId) {
      throw new Error('Expected first pushed project id to be available')
    }

    fakeMateCatService.setProjectStatus(firstProjectId, 'completed')
    await manager.pullReviewedProjects()

    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', createUploadXliff(' v2'))
    writeFile(workspacePath, 'i18n/fr/messages.json', createTranslatedFileContent(' v2'))

    await translationMemory.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [
        { src: 'Hello', dst: 'Bonjour (AI v2)', ctx: '1', pos: 1 },
        { src: 'Goodbye', dst: 'Au revoir (AI v2)', ctx: '2', pos: 2 }
      ]
    })

    await manager.pushReviewProject()

    const projectIds = fakeMateCatService.getProjectIds()
    expect(projectIds).toHaveLength(2)

    const secondProjectId = projectIds[1]
    if (!secondProjectId) {
      throw new Error('Expected second pushed project id to be available')
    }

    fakeMateCatService.setProjectStatus(secondProjectId, 'completed')
    await manager.pullReviewedProjects()

    const lookup = await translationMemory.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello', 'Goodbye'],
      contexts: ['1', '2'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1, 2]
    })

    expect(lookup.get('Hello::1')?.translation).toBe('Bonjour (Human)')
    expect(lookup.get('Goodbye::2')?.translation).toBe('Au revoir (Human)')

    const tmDump = readFileSync(path.join(workspacePath, '.translator', 'translation.jsonl'), 'utf8')
    expect(tmDump.match(/"sourceText":"Hello"/g)).not.toBeNull()
    expect(tmDump.match(/"sourceText":"Hello"/g)).toHaveLength(1)
    expect(tmDump.match(/"sourceText":"Goodbye"/g)).not.toBeNull()
    expect(tmDump.match(/"sourceText":"Goodbye"/g)).toHaveLength(1)
  })
})