import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { TranslatorManager } from '../../../src/core/TranslatorManager'
import type { IConfigProvider } from '../../../src/core/coreConfig'
import { nodeFileSystem } from '../../../src/core/util/fs'
import type { ILogger } from '../../../src/core/util/baseLogger'
import type { IWorkspaceWatcher } from '../../../src/core/util/watcher'
import type {
  IReviewService,
  ReviewProjectStatus,
  ReviewPushRequest
} from '../../../src/core/review/reviewService'

type PendingProject = {
  projectId: string
  status: string
  updates: Array<{ filePath: string; content: string }>
}

class FakeRoundTripReviewService implements IReviewService {
  private readonly projects = new Map<string, PendingProject>()
  private projectCounter = 0
  private lastPush: ReviewPushRequest | undefined

  constructor(private readonly workspacePath: string) {}

  async pushReviewProject(request: ReviewPushRequest): Promise<void> {
    this.projectCounter += 1
    const projectId = `fake-${this.projectCounter}`
    this.lastPush = request

    this.projects.set(projectId, {
      projectId,
      status: 'in_progress',
      updates: []
    })
  }

  async getPendingReviewStatus(): Promise<ReviewProjectStatus[]> {
    return Array.from(this.projects.values()).map((project) => ({
      projectId: project.projectId,
      status: project.status
    }))
  }

  async pullReviewedProjects(): Promise<void> {
    for (const [projectId, project] of this.projects.entries()) {
      if (project.status !== 'completed') {
        continue
      }

      for (const update of project.updates) {
        mkdirSync(path.dirname(update.filePath), { recursive: true })
        writeFileSync(update.filePath, update.content, 'utf8')
      }

      this.projects.delete(projectId)
    }
  }

  getLastPushedRequest(): ReviewPushRequest | undefined {
    return this.lastPush
  }

  getProjectIds(): string[] {
    return Array.from(this.projects.keys())
  }

  stageProjectUpdate(projectId: string, relativeFilePath: string, content: string, status: string = 'completed'): void {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`No pending project found for id ${projectId}`)
    }

    project.status = status
    project.updates.push({
      filePath: path.join(this.workspacePath, relativeFilePath),
      content
    })
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

function createDefaultConfigProvider(): IConfigProvider {
  return {
    get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    update: vi.fn()
  }
}

function writeFile(workspacePath: string, relativePath: string, content: string): void {
  const absolutePath = path.join(workspacePath, relativePath)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, 'utf8')
}

function createManager(
  workspacePath: string,
  fakeReviewService: IReviewService
): TranslatorManager {
  return new TranslatorManager(
    nodeFileSystem,
    createNoOpLogger(),
    {
      putMany: vi.fn(),
      getMany: vi.fn(),
      close: vi.fn(),
      exportCSV: vi.fn(),
      importCSV: vi.fn(),
      hasSourcePath: vi.fn().mockResolvedValue(false),
      hasPendingPurge: vi.fn().mockResolvedValue(false),
      purge: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      completePurge: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      isNew: vi.fn().mockReturnValue(false),
      didMigrateFromV1: vi.fn().mockReturnValue(false),
      clearMigrationFlag: vi.fn()
    },
    workspacePath,
    createNoOpWorkspaceWatcher(),
    createDefaultConfigProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      createReviewService: (): IReviewService => fakeReviewService
    }
  )
}

describe('Review round-trip (fake service)', () => {
  let workspacePath = ''

  beforeEach(() => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-review-roundtrip-'))
  })

  afterEach(() => {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  it('pushes artifacts, reports status, pulls updates, and applies reviewed content to translated files', async () => {
    writeFile(
      workspacePath,
      '.translator/review/fr/upload/messages.xliff',
      '<xliff><file><unit id="1"></unit><unit id="2"></unit></file></xliff>'
    )
    writeFile(
      workspacePath,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (AI)', farewell: 'Au revoir (AI)' }, null, 2)
    )

    const fakeReviewService = new FakeRoundTripReviewService(workspacePath)
    const manager = createManager(workspacePath, fakeReviewService)

    const preview = await manager.getReviewPushPreview()
    expect(preview).toEqual({ translationCount: 2, artifactCount: 1 })

    await manager.pushReviewProject()

    const pushedRequest = fakeReviewService.getLastPushedRequest()
    expect(pushedRequest).toBeDefined()
    expect(pushedRequest?.artifacts).toHaveLength(1)
    expect(pushedRequest?.artifacts[0]?.filePath).toContain('.translator')
    expect(pushedRequest?.artifacts[0]?.filePath).toContain('messages.xliff')

    const pending = await manager.getPendingReviewStatus()
    const [projectId] = fakeReviewService.getProjectIds()
    expect(pending).toEqual([
      {
        projectId,
        status: 'in_progress'
      }
    ])

    if (!projectId) {
      throw new Error('Expected a pushed project id to be available')
    }

    fakeReviewService.stageProjectUpdate(
      projectId,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (Human)', farewell: 'Au revoir (Human)' }, null, 2)
    )

    const completed = await manager.getPendingReviewStatus()
    expect(completed).toEqual([
      {
        projectId,
        status: 'completed'
      }
    ])

    await manager.pullReviewedProjects()

    const updated = JSON.parse(
      readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')
    ) as { greeting: string; farewell: string }
    expect(updated).toEqual({
      greeting: 'Bonjour (Human)',
      farewell: 'Au revoir (Human)'
    })

    const afterPull = await manager.getPendingReviewStatus()
    expect(afterPull).toEqual([])
  })

  it('keeps translated files unchanged when no project is completed', async () => {
    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(
      workspacePath,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (AI)' }, null, 2)
    )

    const fakeReviewService = new FakeRoundTripReviewService(workspacePath)
    const manager = createManager(workspacePath, fakeReviewService)

    await manager.pushReviewProject()
    await manager.pullReviewedProjects()

    const unchanged = JSON.parse(
      readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')
    ) as { greeting: string }

    expect(unchanged).toEqual({ greeting: 'Bonjour (AI)' })
  })

  it('applies only completed projects when pending and completed projects coexist', async () => {
    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(workspacePath, '.translator/review/es/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(workspacePath, 'i18n/fr/messages.json', JSON.stringify({ greeting: 'Bonjour (AI)' }, null, 2))
    writeFile(workspacePath, 'i18n/es/messages.json', JSON.stringify({ greeting: 'Hola (AI)' }, null, 2))

    const fakeReviewService = new FakeRoundTripReviewService(workspacePath)
    const manager = createManager(workspacePath, fakeReviewService)

    await manager.pushReviewProject()
    await manager.pushReviewProject()

    const [firstProjectId, secondProjectId] = fakeReviewService.getProjectIds()
    fakeReviewService.stageProjectUpdate(
      firstProjectId,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (Human)' }, null, 2)
    )
    fakeReviewService.stageProjectUpdate(
      secondProjectId,
      'i18n/es/messages.json',
      JSON.stringify({ greeting: 'Hola (Human)' }, null, 2),
      'in_progress'
    )

    await manager.pullReviewedProjects()

    const fr = JSON.parse(readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')) as { greeting: string }
    const es = JSON.parse(readFileSync(path.join(workspacePath, 'i18n/es/messages.json'), 'utf8')) as { greeting: string }

    expect(fr).toEqual({ greeting: 'Bonjour (Human)' })
    expect(es).toEqual({ greeting: 'Hola (AI)' })

    const remainingStatuses = await manager.getPendingReviewStatus()
    expect(remainingStatuses).toEqual([{ projectId: secondProjectId, status: 'in_progress' }])
  })

  it('merges multiple completed projects in a single pull', async () => {
    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(workspacePath, '.translator/review/es/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(workspacePath, 'i18n/fr/messages.json', JSON.stringify({ greeting: 'Bonjour (AI)' }, null, 2))
    writeFile(workspacePath, 'i18n/es/messages.json', JSON.stringify({ greeting: 'Hola (AI)' }, null, 2))

    const fakeReviewService = new FakeRoundTripReviewService(workspacePath)
    const manager = createManager(workspacePath, fakeReviewService)

    await manager.pushReviewProject()
    await manager.pushReviewProject()

    const [firstProjectId, secondProjectId] = fakeReviewService.getProjectIds()
    fakeReviewService.stageProjectUpdate(
      firstProjectId,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (Human)' }, null, 2)
    )
    fakeReviewService.stageProjectUpdate(
      secondProjectId,
      'i18n/es/messages.json',
      JSON.stringify({ greeting: 'Hola (Human)' }, null, 2)
    )

    await manager.pullReviewedProjects()

    const fr = JSON.parse(readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')) as { greeting: string }
    const es = JSON.parse(readFileSync(path.join(workspacePath, 'i18n/es/messages.json'), 'utf8')) as { greeting: string }

    expect(fr).toEqual({ greeting: 'Bonjour (Human)' })
    expect(es).toEqual({ greeting: 'Hola (Human)' })
    expect(await manager.getPendingReviewStatus()).toEqual([])
  })

  it('does not change output when pulling the same completed project twice', async () => {
    writeFile(workspacePath, '.translator/review/fr/upload/messages.xliff', '<xliff><file><unit id="1"/></file></xliff>')
    writeFile(workspacePath, 'i18n/fr/messages.json', JSON.stringify({ greeting: 'Bonjour (AI)' }, null, 2))

    const fakeReviewService = new FakeRoundTripReviewService(workspacePath)
    const manager = createManager(workspacePath, fakeReviewService)

    await manager.pushReviewProject()

    const [projectId] = fakeReviewService.getProjectIds()
    fakeReviewService.stageProjectUpdate(
      projectId,
      'i18n/fr/messages.json',
      JSON.stringify({ greeting: 'Bonjour (Human)' }, null, 2)
    )

    await manager.pullReviewedProjects()

    const firstPull = readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')
    await manager.pullReviewedProjects()
    const secondPull = readFileSync(path.join(workspacePath, 'i18n/fr/messages.json'), 'utf8')

    expect(secondPull).toBe(firstPull)
    expect(JSON.parse(secondPull) as { greeting: string }).toEqual({ greeting: 'Bonjour (Human)' })
  })
})