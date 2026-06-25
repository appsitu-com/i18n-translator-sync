import * as path from 'path'
import { loadProjectConfig, type IConfigProvider } from '../coreConfig'
import type { IFileSystem } from '../util/fs'
import type { ILogger } from '../util/baseLogger'
import type { ITranslationMemory } from '../tm/ITranslationMemory'
import type { IReviewService, ReviewPushRequest } from './reviewService'
import { mergeReviewedXliffFilesIntoTranslationMemory } from './xliffReviewImporter'
import {
  type IMateCatCreatedProject,
  type IMateCatProjectRef,
  type IMateCatProjectStatus,
  type IMateCatPulledFile,
  type IMateCatService,
  MateCatService,
  type MateCatNewProjectDefaults,
  type MateCatRuntimeNewProjectFields,
  type MateCatSettings,
  type MateCatSettingsLoader,
  loadMateCatSettings
} from './MateCatService'

type PendingReviewProject = {
  projectId: string
  projectPass: string
  createdAt: string
}

export type MateCatReviewServiceDependencies = {
  createMateCatService?: (logger: ILogger) => IMateCatService
  loadMateCatSettings?: MateCatSettingsLoader
  translationMemory?: ITranslationMemory
}

export class MateCatReviewService implements IReviewService {
  private static readonly REVIEW_DIR = '.translator/review'
  private static readonly PENDING_REVIEW_PROJECTS_FILE = 'pending-projects.json'
  private static readonly REVIEW_DOWNLOAD_DIR = 'download'

  private readonly mateCatService: IMateCatService

  constructor(
    private readonly workspacePath: string,
    private readonly fileSystem: IFileSystem,
    private readonly logger: ILogger,
    private readonly configProvider: IConfigProvider,
    private readonly dependencies: MateCatReviewServiceDependencies = {}
  ) {
    this.mateCatService =
      this.dependencies.createMateCatService?.(this.logger) ?? new MateCatService(this.logger)
  }

  private getMateCatSettings(): MateCatSettings {
    const settingsLoader = this.dependencies.loadMateCatSettings ?? loadMateCatSettings
    return settingsLoader(this.workspacePath, this.logger)
  }

  private normalizeLocale(locale: string): string {
    return locale.trim().toLowerCase()
  }

  private async resolveFallbackProjectName(projectPrefix: string | undefined, targetLocale: string): Promise<string> {
    const packageJsonPath = path.join(this.workspacePath, 'package.json')
    const packageJsonUri = this.fileSystem.createUri(packageJsonPath)
    const defaultBaseName = 'translation-review'

    const localeSuffix = targetLocale.trim().replace(/\s+/g, '')

    let baseName =
      typeof projectPrefix === 'string' && projectPrefix.trim().length > 0
        ? projectPrefix.trim()
        : defaultBaseName

    if (baseName !== defaultBaseName) {
      return localeSuffix.length > 0 ? `${baseName}-${localeSuffix}` : baseName
    }

    try {
      const exists = await this.fileSystem.fileExists(packageJsonUri)
      if (exists) {
        const rawPackageJson = await this.fileSystem.readFile(packageJsonUri)
        const parsed = JSON.parse(rawPackageJson) as { name?: unknown }
        if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
          baseName = parsed.name.trim().replace(/^@/, '').replace(/[\/]/g, '-')
        }
      }
    } catch (error) {
      this.logger.warn(
        `Unable to resolve package name from package.json for MateCat project naming: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return localeSuffix.length > 0 ? `${baseName}-${localeSuffix}` : baseName
  }

  private async buildMateCatProjectFields(settings: MateCatSettings, targetLocale: string): Promise<MateCatNewProjectDefaults> {
    const projectConfig = loadProjectConfig(this.workspacePath, this.configProvider, this.logger)
    const sourceLocale = projectConfig.sourceLocale
    const reviewerProjectPrefix = projectConfig.reviewer?.project

    const configuredProjectName = settings.newProjectDefaults.project_name
    const resolvedProjectName =
      typeof configuredProjectName === 'string' && configuredProjectName.trim().length > 0
        ? configuredProjectName.trim()
        : await this.resolveFallbackProjectName(reviewerProjectPrefix, targetLocale)

    const runtimeFields: MateCatRuntimeNewProjectFields = {
      source_lang: sourceLocale,
      target_lang: targetLocale,
      project_name: resolvedProjectName
    }

    const mergedFields: MateCatNewProjectDefaults = {
      ...settings.newProjectDefaults,
      ...runtimeFields
    }

    const filteredFields: MateCatNewProjectDefaults = {}
    for (const [name, value] of Object.entries(mergedFields)) {
      if (name === 'files[]') {
        continue
      }
      filteredFields[name] = value
    }

    const requiredFields = ['project_name', 'source_lang', 'target_lang']
    for (const fieldName of requiredFields) {
      const value = filteredFields[fieldName]
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
          `MateCat push requires a non-empty "${fieldName}" in merged defaults/runtime fields`
        )
      }
    }

    return filteredFields
  }

  private async buildMateCatReviewUploads(request: ReviewPushRequest): Promise<
    Array<{ fieldName: string; fileName: string; content: Buffer; contentType: string }>
  > {
    if (request.artifacts.length === 0) {
      throw new Error('MateCat push requires at least one .tmx, .xlf, or .xliff file in the workspace')
    }

    return Promise.all(
      request.artifacts.map(async (artifact) => ({
        fieldName: 'files[]',
        fileName: artifact.fileName || path.basename(artifact.filePath),
        content: Buffer.from(await this.fileSystem.readFile(this.fileSystem.createUri(artifact.filePath)), 'utf8'),
        contentType: artifact.contentType
      }))
    )
  }

  private getPendingReviewProjectsPath(): string {
    return path.join(
      this.workspacePath,
      MateCatReviewService.REVIEW_DIR,
      MateCatReviewService.PENDING_REVIEW_PROJECTS_FILE
    )
  }

  private async loadPendingReviewProjects(): Promise<PendingReviewProject[]> {
    const pendingPath = this.getPendingReviewProjectsPath()
    const pendingUri = this.fileSystem.createUri(pendingPath)
    const exists = await this.fileSystem.fileExists(pendingUri)
    if (!exists) {
      return []
    }

    try {
      const content = await this.fileSystem.readFile(pendingUri)
      const parsed = JSON.parse(content) as unknown
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed.filter((item): item is PendingReviewProject => {
        if (!item || typeof item !== 'object') {
          return false
        }

        const candidate = item as Record<string, unknown>
        return (
          typeof candidate.projectId === 'string' &&
          typeof candidate.projectPass === 'string' &&
          typeof candidate.createdAt === 'string'
        )
      })
    } catch (error) {
      this.logger.warn(
        `Failed to parse pending MateCat projects file: ${error instanceof Error ? error.message : String(error)}`
      )
      return []
    }
  }

  private async savePendingReviewProjects(projects: PendingReviewProject[]): Promise<void> {
    const pendingPath = this.getPendingReviewProjectsPath()
    const pendingUri = this.fileSystem.createUri(pendingPath)
    const parentDirUri = this.fileSystem.createUri(path.dirname(pendingPath))
    await this.fileSystem.createDirectory(parentDirUri)
    await this.fileSystem.writeFile(pendingUri, JSON.stringify(projects, null, 2))
  }

  private async trackPendingReviewProject(createdProject: IMateCatCreatedProject): Promise<void> {
    if (!createdProject.projectId || !createdProject.projectPass) {
      this.logger.warn('MateCat project created but project credentials were not returned; pending tracking skipped')
      return
    }

    const current = await this.loadPendingReviewProjects()
    if (current.some((project) => project.projectId === createdProject.projectId)) {
      return
    }

    current.push({
      projectId: createdProject.projectId,
      projectPass: createdProject.projectPass,
      createdAt: new Date().toISOString()
    })

    await this.savePendingReviewProjects(current)
    this.logger.info(`MateCat: tracked pending project ${createdProject.projectId}`)
  }

  private getReviewDownloadDirectoryPath(projectId: string): string {
    return path.join(
      this.workspacePath,
      MateCatReviewService.REVIEW_DIR,
      MateCatReviewService.REVIEW_DOWNLOAD_DIR,
      projectId
    )
  }

  private async persistPulledReviewFiles(files: IMateCatPulledFile[]): Promise<number> {
    let savedCount = 0

    for (const file of files) {
      const downloadDirPath = this.getReviewDownloadDirectoryPath(file.projectId)
      const downloadDirUri = this.fileSystem.createUri(downloadDirPath)
      await this.fileSystem.createDirectory(downloadDirUri)

      const outputFileUri = this.fileSystem.joinPath(downloadDirUri, file.fileName)
      await this.fileSystem.writeFile(outputFileUri, file.content)
      savedCount++
    }

    return savedCount
  }

  private isCompletedMateCatStatus(status: string): boolean {
    const normalized = status.toLowerCase()
    return normalized === 'done' || normalized === 'completed' || normalized === 'complete'
  }

  private toMateCatProjectRefs(projects: PendingReviewProject[]): IMateCatProjectRef[] {
    return projects.map((project) => ({
      projectId: project.projectId,
      projectPass: project.projectPass
    }))
  }

  async pushReviewProject(request: ReviewPushRequest): Promise<void> {
    const settings = this.getMateCatSettings()
    const targetLocale = request.targetLocale?.trim()
    if (!targetLocale) {
      throw new Error('MateCat push requires a target locale per request')
    }

    const fields = await this.buildMateCatProjectFields(settings, targetLocale)
    const uploads = await this.buildMateCatReviewUploads(request)

    const createdProject = await this.mateCatService.createReviewProject(settings, {
      fields,
      uploads
    })

    await this.trackPendingReviewProject(createdProject)
    this.logger.info(`MateCat: new project created for locale ${targetLocale} with uploaded review file(s).`)
  }

  async pullReviewedProjects(): Promise<void> {
    const settings = this.getMateCatSettings()
    const pendingProjects = await this.loadPendingReviewProjects()
    if (pendingProjects.length === 0) {
      this.logger.info('No pending MateCat projects to pull')
      return
    }

    const statuses = await this.mateCatService.checkReviewProjectStatus(
      settings,
      this.toMateCatProjectRefs(pendingProjects)
    )

    const completedProjectIds = new Set(
      statuses.filter((project) => this.isCompletedMateCatStatus(project.status)).map((project) => project.projectId)
    )

    if (completedProjectIds.size === 0) {
      this.logger.info('No completed MateCat projects are ready for pull')
      return
    }

    const completedProjects = pendingProjects.filter((project) => completedProjectIds.has(project.projectId))
    const successfullyMergedProjects = new Set<string>()

    for (const project of completedProjects) {
      const pulledFiles = await this.mateCatService.pullReviewedTranslations(settings, this.toMateCatProjectRefs([project]))
      const savedCount = await this.persistPulledReviewFiles(pulledFiles)
      this.logger.info(`MateCat: downloaded ${savedCount} reviewed file(s) for project ${project.projectId}`)

      if (this.dependencies.translationMemory) {
        await mergeReviewedXliffFilesIntoTranslationMemory(
          pulledFiles,
          this.dependencies.translationMemory,
          this.logger
        )
      }

      successfullyMergedProjects.add(project.projectId)
    }

    const remainingProjects = pendingProjects.filter((project) => !successfullyMergedProjects.has(project.projectId))
    await this.savePendingReviewProjects(remainingProjects)
    this.logger.info(`MateCat: closed ${successfullyMergedProjects.size} pending project(s) after successful pull merge`)
  }

  async getPendingReviewStatus(): Promise<IMateCatProjectStatus[]> {
    const pendingProjects = await this.loadPendingReviewProjects()
    if (pendingProjects.length === 0) {
      return []
    }

    const settings = this.getMateCatSettings()
    return this.mateCatService.checkReviewProjectStatus(settings, this.toMateCatProjectRefs(pendingProjects))
  }
}
