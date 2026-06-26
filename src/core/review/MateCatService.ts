import * as fs from 'fs'
import * as path from 'path'
import JSON5 from 'json5'
import { MATECAT_JSON } from '../constants'
import { MateCatDefaultsSchema, type MateCatFormValue } from '../config/mateCatConfigSchema'
import { MissingEnvironmentValueError, getRequiredEnvironmentValue } from '../config'
import { ILogger, NO_OP_LOGGER } from '../util/baseLogger'

const MATECAT_BASE_URL = 'https://www.matecat.com'
const MATECAT_NEW_PROJECT_PATH = '/api/v1/new'
const MATECAT_HEADER_KEY = 'x-matecat-key'

const COMPUTED_MATECAT_FIELDS = new Set(['files[]', 'source_lang', 'target_lang'])

const ALLOWED_MATECAT_DEFAULT_FIELDS = new Set([
  'project_name',
  'tms_engine',
  'mt_engine',
  'private_tm_key',
  'private_tm_key_json',
  'subject',
  'segmentation_rule',
  'owner_email',
  'due_date',
  'id_team',
  'payable_rate_template_id',
  'payable_rate_template_name',
  'get_public_matches',
  'pretranslate_100',
  'pretranslate_101',
  'dialect_strict',
  'lara_glossaries',
  'mmt_glossaries',
  'mmt_ignore_glossary_case',
  'mmt_activate_context_analyzer',
  'deepl_formality',
  'deepl_id_glossary',
  'deepl_engine_type',
  'filters_extraction_parameters',
  'xliff_parameters',
  'xliff_parameters_template_id',
  'filters_extraction_parameters_template_id',
  'id_qa_model',
  'id_qa_model_template',
  'character_counter_count_tags',
  'character_counter_mode',
  'mt_evaluation',
  'mt_quality_value_in_editor',
  'legacy_icu',
  'public_tm_penalty',
  'project_completion',
  'qa_model_template_id',
  'enable_mt_analysis',
  'intento_routing',
  'intento_provider',
  'instructions[]',
  'subfiltering_handlers'
])

type MateCatFormScalar = string | number | boolean

export type MateCatNewProjectDefaults = Record<string, MateCatFormValue>

/**
 * MateCat integration settings
 */
export type MateCatSettings = {
  apiKey: string
  newProjectDefaults: MateCatNewProjectDefaults
}

export type IMateCatProjectUpload = {
  fieldName: string
  fileName: string
  content: Buffer
  contentType?: string
}

export type IMateCatReviewProjectRequest = {
  fields: MateCatNewProjectDefaults
  uploads: IMateCatProjectUpload[]
}

export type IMateCatCreatedProject = {
  projectId?: string
  projectPass?: string
}

export type IMateCatProjectRef = {
  projectId: string
  projectPass: string
}

export type IMateCatProjectStatus = {
  projectId: string
  status: string
  percentDone?: number
  projectName?: string
}

export type IMateCatPulledFile = {
  projectId: string
  fileName: string
  content: string
}

export interface IMateCatService {
  createReviewProject(
    settings: MateCatSettings,
    request: IMateCatReviewProjectRequest
  ): Promise<IMateCatCreatedProject>

  checkReviewProjectStatus(settings: MateCatSettings, projects: IMateCatProjectRef[]): Promise<IMateCatProjectStatus[]>

  pullReviewedTranslations(settings: MateCatSettings, projects: IMateCatProjectRef[]): Promise<IMateCatPulledFile[]>

  deleteReviewProject?(settings: MateCatSettings, project: IMateCatProjectRef): Promise<void>
}

export type MateCatSettingsLoader = (workspacePath: string, logger?: ILogger) => MateCatSettings

export interface IMateCatHttpResponse {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
}


export interface IMateCatHttpClient {
  send(url: string, request: { method: string; headers: Record<string, string>; body?: Buffer }): Promise<IMateCatHttpResponse>
}

class DefaultMateCatHttpClient implements IMateCatHttpClient {
  async send(
    url: string,
    request: { method: string; headers: Record<string, string>; body?: Buffer }
  ): Promise<IMateCatHttpResponse> {
    const response = await fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body
    })

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: async () => response.text()
    }
  }
}

export type MateCatRuntimeNewProjectFields = Partial<
  Pick<Record<string, MateCatFormScalar>, 'source_lang' | 'target_lang' | 'project_name'>
>

function parseMateCatDefaults(content: string, logger: ILogger): MateCatNewProjectDefaults {
  const parsed = JSON5.parse(content) as unknown

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('matecat.json must contain a JSON object')
  }

  const root = parsed as Record<string, unknown>
  const defaultsCandidate =
    root.newProjectDefaults && typeof root.newProjectDefaults === 'object'
      ? (root.newProjectDefaults as Record<string, unknown>)
      : root

  const parsedDefaults = MateCatDefaultsSchema.safeParse(defaultsCandidate)
  if (!parsedDefaults.success) {
    const firstIssue = parsedDefaults.error.issues[0]
    const issuePath = firstIssue?.path?.join('.')
    const fieldHint = issuePath ? ` at "${issuePath}"` : ''
    throw new Error(`matecat.json defaults validation failed${fieldHint}: ${firstIssue?.message ?? 'invalid value'}`)
  }

  const defaults: MateCatNewProjectDefaults = {}
  for (const [key, value] of Object.entries(parsedDefaults.data)) {

    if (COMPUTED_MATECAT_FIELDS.has(key)) {
      logger.warn(`Ignoring matecat.json field "${key}" because it is computed at runtime`)
      continue
    }

    if (!ALLOWED_MATECAT_DEFAULT_FIELDS.has(key)) {
      logger.warn(`Ignoring unsupported matecat.json field "${key}"`)
      continue
    }

    defaults[key] = value
  }

  return defaults
}

export function loadMateCatSettings(workspacePath: string, logger: ILogger = NO_OP_LOGGER): MateCatSettings {
  const apiKey = getRequiredEnvironmentValue('MATECAT_API_KEY').trim()
  if (!apiKey) {
    throw new MissingEnvironmentValueError('MATECAT_API_KEY')
  }

  const mateCatJsonPath = path.join(workspacePath, MATECAT_JSON)
  const defaults = fs.existsSync(mateCatJsonPath)
    ? parseMateCatDefaults(fs.readFileSync(mateCatJsonPath, 'utf8'), logger)
    : {}

  return {
    apiKey,
    newProjectDefaults: defaults
  }
}

/**
 * MateCat integration service
 */
export class MateCatService implements IMateCatService {
  private logger: ILogger
  private readonly httpClient: IMateCatHttpClient

  constructor(logger: ILogger, httpClient: IMateCatHttpClient = new DefaultMateCatHttpClient()) {
    this.logger = logger
    this.httpClient = httpClient
  }

  private appendMultipartScalarField(chunks: Buffer[], boundary: string, name: string, value: MateCatFormScalar): void {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'))
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`, 'utf8'))
    chunks.push(Buffer.from(String(value), 'utf8'))
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }

  private appendMultipartField(chunks: Buffer[], boundary: string, name: string, value: MateCatFormValue): void {
    if (Array.isArray(value)) {
      for (const scalarValue of value) {
        this.appendMultipartScalarField(chunks, boundary, name, scalarValue)
      }
      return
    }

    this.appendMultipartScalarField(chunks, boundary, name, value)
  }

  private appendMultipartFile(
    chunks: Buffer[],
    boundary: string,
    upload: IMateCatProjectUpload
  ): void {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'))
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${upload.fieldName}"; filename="${upload.fileName}"\r\n` +
          `Content-Type: ${upload.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        'utf8'
      )
    )
    chunks.push(upload.content)
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }

  private tryExtractProjectId(responseBody: string): string | undefined {
    try {
      const parsed = JSON.parse(responseBody) as Record<string, unknown>
      const candidate = parsed.id_project ?? parsed.id ?? parsed.project_id ?? parsed.projectId
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }

      if (typeof candidate === 'number') {
        return String(candidate)
      }
    } catch {
      // Ignore JSON parsing errors because MateCat may return non-JSON content.
    }

    return undefined
  }

  private tryExtractProjectPass(responseBody: string): string | undefined {
    try {
      const parsed = JSON.parse(responseBody) as Record<string, unknown>
      const candidate = parsed.project_pass ?? parsed.password ?? parsed.projectPass
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    } catch {
      // Ignore JSON parsing errors because MateCat may return non-JSON content.
    }

    return undefined
  }

  private extractDownloadUrlsFromProject(projectPayload: Record<string, unknown>): string[] {
    const urls: string[] = []

    // Extract xliff_download_url from each job in the ExtendedJob array
    const jobsCandidate = projectPayload.jobs
    if (Array.isArray(jobsCandidate)) {
      for (const job of jobsCandidate) {
        if (!job || typeof job !== 'object') {
          continue
        }

        const jobRecord = job as Record<string, unknown>

        // Check for xliff_download_url in urls object (primary location in v3 API)
        const urlsObj = jobRecord.urls
        if (urlsObj && typeof urlsObj === 'object') {
          const urlsRecord = urlsObj as Record<string, unknown>
          const xliffUrl = urlsRecord.xliff_download_url
          if (typeof xliffUrl === 'string' && xliffUrl.trim().length > 0) {
            urls.push(xliffUrl.trim())
            continue
          }
        }

        // Fallback: check for direct xliff_download_url property
        const xliffUrl = jobRecord.xliff_download_url
        if (typeof xliffUrl === 'string' && xliffUrl.trim().length > 0) {
          urls.push(xliffUrl.trim())
        }
      }
    }

    return urls
  }

  private deriveFileName(downloadUrl: string, projectId: string, index: number): string {
    try {
      const parsedUrl = new URL(downloadUrl)
      const candidate = path.basename(parsedUrl.pathname)
      if (candidate.trim().length > 0) {
        return candidate
      }
    } catch {
      // Ignore URL parsing errors and use fallback file name.
    }

    return `${projectId}-${index + 1}.xliff`
  }

  private normalizeStatus(status: string): string {
    return status.trim().toLowerCase()
  }

  private isCompletedChunkStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status)
    return (
      normalized === 'complete' ||
      normalized === 'completed' ||
      normalized === 'done' ||
      normalized === 'closed' ||
      normalized === 'archived' ||
      normalized === 'final' ||
      normalized === 'finalized'
    )
  }

  private getChunkStatuses(parsed: Record<string, unknown>): string[] {
    const chunkStatuses: string[] = []

    for (const chunkRecord of this.getChunks(parsed)) {
      const status = chunkRecord.status
      if (typeof status === 'string' && status.trim().length > 0) {
        chunkStatuses.push(this.normalizeStatus(status))
      }
    }

    return chunkStatuses
  }

  private getChunks(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
    const directChunks = parsed.chunks
    if (Array.isArray(directChunks)) {
      return directChunks.filter((chunk): chunk is Record<string, unknown> => Boolean(chunk && typeof chunk === 'object'))
    }

    const jobs = parsed.jobs
    if (!Array.isArray(jobs)) {
      return []
    }

    const chunks: Array<Record<string, unknown>> = []
    for (const job of jobs) {
      if (!job || typeof job !== 'object') {
        continue
      }

      const jobRecord = job as Record<string, unknown>
      const jobChunks = jobRecord.chunks
      if (!Array.isArray(jobChunks)) {
        continue
      }

      for (const chunk of jobChunks) {
        if (chunk && typeof chunk === 'object') {
          chunks.push(chunk as Record<string, unknown>)
        }
      }
    }

    return chunks
  }

  private asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }

    return undefined
  }

  private extractPercentDoneFromChunkStats(parsed: Record<string, unknown>): number | undefined {
    let totalSegments = 0
    let completedSegments = 0

    // First, try to extract from job-level stats (primary source in v3 API)
    const jobs = parsed.jobs
    if (Array.isArray(jobs)) {
      for (const job of jobs) {
        if (!job || typeof job !== 'object') {
          continue
        }

        const jobRecord = job as Record<string, unknown>
        const stats = jobRecord.stats
        if (!stats || typeof stats !== 'object') {
          continue
        }

        const statsRecord = stats as Record<string, unknown>
        const rawCandidate = statsRecord.raw
        const equivalentCandidate = statsRecord.equivalent

        const selectedStats =
          rawCandidate && typeof rawCandidate === 'object'
            ? (rawCandidate as Record<string, unknown>)
            : equivalentCandidate && typeof equivalentCandidate === 'object'
              ? (equivalentCandidate as Record<string, unknown>)
              : undefined

        if (!selectedStats) {
          continue
        }

        const total = this.asFiniteNumber(selectedStats.total)
        if (!total || total <= 0) {
          continue
        }

        const translated = this.asFiniteNumber(selectedStats.translated) ?? 0
        const approved = this.asFiniteNumber(selectedStats.approved) ?? 0
        const approved2 = this.asFiniteNumber(selectedStats.approved2) ?? 0

        totalSegments += total
        completedSegments += translated + approved + approved2
      }
    }

    // If no job-level stats found, try chunk-level stats (legacy/fallback)
    if (totalSegments === 0) {
      for (const chunkRecord of this.getChunks(parsed)) {
        const stats = chunkRecord.stats
        if (!stats || typeof stats !== 'object') {
          continue
        }

        const statsRecord = stats as Record<string, unknown>
        const rawCandidate = statsRecord.raw
        const equivalentCandidate = statsRecord.equivalent

        const selectedStats =
          rawCandidate && typeof rawCandidate === 'object'
            ? (rawCandidate as Record<string, unknown>)
            : equivalentCandidate && typeof equivalentCandidate === 'object'
              ? (equivalentCandidate as Record<string, unknown>)
              : undefined

        if (!selectedStats) {
          continue
        }

        const total = this.asFiniteNumber(selectedStats.total)
        if (!total || total <= 0) {
          continue
        }

        const translated = this.asFiniteNumber(selectedStats.translated) ?? 0
        const approved = this.asFiniteNumber(selectedStats.approved) ?? 0
        const approved2 = this.asFiniteNumber(selectedStats.approved2) ?? 0

        totalSegments += total
        completedSegments += translated + approved + approved2
      }
    }

    if (totalSegments <= 0) {
      return undefined
    }

    return Math.max(0, Math.min(100, Math.round((completedSegments / totalSegments) * 100)))
  }

  private reduceChunkStatuses(chunkStatuses: string[]): string {
    if (chunkStatuses.length === 0) {
      return 'unknown'
    }

    const allCompleted = chunkStatuses.every((status) => this.isCompletedChunkStatus(status))
    if (allCompleted) {
      return 'completed'
    }

    const unique = Array.from(new Set(chunkStatuses))
    if (unique.length === 1) {
      return unique[0] as string
    }

    return 'in_progress'
  }

  private calculatePercentDone(chunkStatuses: string[]): number | undefined {
    if (chunkStatuses.length === 0) {
      return undefined
    }

    const completedCount = chunkStatuses.filter((status) => this.isCompletedChunkStatus(status)).length
    return Math.round((completedCount / chunkStatuses.length) * 100)
  }

  private extractReviewStatus(statusBody: string): string {
    try {
      const parsed = JSON.parse(statusBody) as Record<string, unknown>
      const chunkStatuses = this.getChunkStatuses(parsed)
      if (chunkStatuses.length > 0) {
        return this.reduceChunkStatuses(chunkStatuses)
      }

      const candidate = parsed.project_status ?? parsed.status ?? parsed.STATUS
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        const normalized = this.normalizeStatus(candidate)
        // MateCat analysis endpoint often reports "DONE" even while review chunks remain active.
        return normalized === 'done' ? 'analysis_done' : normalized
      }
    } catch {
      // Keep the fallback for non-JSON responses.
    }

    return 'unknown'
  }

  private inferPercentDoneFromStatus(status: string): number | undefined {
    if (status === 'completed' || status === 'complete' || status === 'final' || status === 'finalized') {
      return 100
    }

    if (status === 'in_progress' || status === 'active' || status === 'new' || status === 'open' || status === 'analysis_done') {
      return 0
    }

    return undefined
  }

  private parseJsonObject(text: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Ignore JSON parsing errors because some endpoints can return plain text.
    }

    return undefined
  }

  private extractJobIds(payload: Record<string, unknown>): string[] {
    const jobIds = new Set<string>()

    const addJobId = (candidate: unknown): void => {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        jobIds.add(candidate.trim())
        return
      }

      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        jobIds.add(String(candidate))
      }
    }

    const jobsCandidate = payload.jobs
    if (Array.isArray(jobsCandidate)) {
      for (const job of jobsCandidate) {
        if (typeof job === 'string' || typeof job === 'number') {
          addJobId(job)
          continue
        }

        if (!job || typeof job !== 'object') {
          continue
        }

        const jobRecord = job as Record<string, unknown>
        addJobId(jobRecord.id_job ?? jobRecord.job_id ?? jobRecord.id)
      }
    }

    const filesCandidate = payload.files
    if (Array.isArray(filesCandidate)) {
      for (const fileItem of filesCandidate) {
        if (!fileItem || typeof fileItem !== 'object') {
          continue
        }

        const fileRecord = fileItem as Record<string, unknown>
        addJobId(fileRecord.id_job ?? fileRecord.job_id ?? fileRecord.id)
      }
    }

    addJobId(payload.id_job ?? payload.job_id)

    return Array.from(jobIds)
  }

  private combineProjectAndJobPayloads(
    projectPayload: Record<string, unknown>,
    jobPayloads: Array<Record<string, unknown>>
  ): Record<string, unknown> {
    if (jobPayloads.length === 0) {
      return projectPayload
    }

    const mergedChunks = jobPayloads.flatMap((payload) => this.getChunks(payload))
    return {
      ...projectPayload,
      jobs: jobPayloads,
      chunks: mergedChunks
    }
  }

  private deriveStatusFromPayload(payload: Record<string, unknown>): string {
    const chunkStatuses = this.getChunkStatuses(payload)
    if (chunkStatuses.length > 0) {
      return this.reduceChunkStatuses(chunkStatuses)
    }

    const candidate = payload.project_status ?? payload.status ?? payload.STATUS
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const normalized = this.normalizeStatus(candidate)
      return normalized === 'done' ? 'analysis_done' : normalized
    }

    const filesCandidate = payload.files
    if (Array.isArray(filesCandidate) && filesCandidate.length > 0) {
      return 'in_progress'
    }

    return 'unknown'
  }

  public async createReviewProject(
    settings: MateCatSettings,
    request: IMateCatReviewProjectRequest
  ): Promise<IMateCatCreatedProject> {
    const url = `${MATECAT_BASE_URL}${MATECAT_NEW_PROJECT_PATH}`
    this.logger.info(`Creating MateCat review project: ${url}`)
    const boundary = `----mcform${Math.random().toString(16).slice(2)}`
    const bodyParts: Buffer[] = []

    for (const [name, value] of Object.entries(request.fields)) {
      this.appendMultipartField(bodyParts, boundary, name, value)
    }

    for (const upload of request.uploads) {
      this.appendMultipartFile(bodyParts, boundary, upload)
    }
    bodyParts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))

    const headers: Record<string,string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      [MATECAT_HEADER_KEY]: settings.apiKey
    }

    try {
      const res = await this.httpClient.send(url, {
        method: 'POST',
        headers,
        body: Buffer.concat(bodyParts)
      })

      const txt = await res.text()

      if (!res.ok) {
        throw new Error(`MateCat project creation failed: ${res.status} ${res.statusText} ${txt}`)
      }

      this.logger.info('Successfully created MateCat review project')
      return {
        projectId: this.tryExtractProjectId(txt),
        projectPass: this.tryExtractProjectPass(txt)
      }
    } catch (error) {
      this.logger.error(`Error creating MateCat review project: ${error}`)
      throw error
    }
  }

  public async pullReviewedTranslations(settings: MateCatSettings, projects: IMateCatProjectRef[]): Promise<IMateCatPulledFile[]> {
    const pulledFiles: IMateCatPulledFile[] = []

    for (const project of projects) {
      // Use direct project endpoint to get all job data with download URLs in one call
      const projectEndpoint =
        `${MATECAT_BASE_URL}/api/v3/projects/${encodeURIComponent(project.projectId)}` +
        `/${encodeURIComponent(project.projectPass)}`
      const projectResponse = await this.httpClient.send(projectEndpoint, {
        method: 'GET',
        headers: {
          [MATECAT_HEADER_KEY]: settings.apiKey
        }
      })

      const projectBody = await projectResponse.text()
      if (!projectResponse.ok) {
        throw new Error(
          `MateCat project fetch failed for pull-reviewed for project ${project.projectId}: ` +
            `${projectResponse.status} ${projectResponse.statusText} ${projectBody}`
        )
      }

      // Extract download URLs from jobs array in project response
      const responseData = this.parseJsonObject(projectBody) ?? {}
      const projectPayload = (responseData.project ?? responseData) as Record<string, unknown>
      const downloadUrls = this.extractDownloadUrlsFromProject(projectPayload)

      for (const [index, downloadUrl] of downloadUrls.entries()) {
        const fileResponse = await this.httpClient.send(downloadUrl, {
          method: 'GET',
          headers: {
            [MATECAT_HEADER_KEY]: settings.apiKey
          }
        })

        const fileBody = await fileResponse.text()
        if (!fileResponse.ok) {
          throw new Error(
            `MateCat reviewed file download failed for project ${project.projectId}: ${fileResponse.status} ${fileResponse.statusText} ${fileBody}`
          )
        }

        pulledFiles.push({
          projectId: project.projectId,
          fileName: this.deriveFileName(downloadUrl, project.projectId, index),
          content: fileBody
        })
      }
    }

    return pulledFiles
  }

  public async checkReviewProjectStatus(settings: MateCatSettings, projects: IMateCatProjectRef[]): Promise<IMateCatProjectStatus[]> {
    const statuses: IMateCatProjectStatus[] = []

    for (const project of projects) {
      // Use direct project endpoint instead of /urls to get all job data in one call
      const v3ProjectUrl =
        `${MATECAT_BASE_URL}/api/v3/projects/${encodeURIComponent(project.projectId)}` +
        `/${encodeURIComponent(project.projectPass)}`
      const v3ProjectResponse = await this.httpClient.send(v3ProjectUrl, {
        method: 'GET',
        headers: {
          [MATECAT_HEADER_KEY]: settings.apiKey
        }
      })

      const projectBody = await v3ProjectResponse.text()
      // let formattedProjectBody = projectBody
      // try {
      //   formattedProjectBody = JSON.stringify(JSON.parse(projectBody), null, 2)
      // } catch {
      //   // Keep raw response when projectBody is not JSON.
      // }
      // this.logger.debug(`MateCat project response for project ${project.projectId}: ${formattedProjectBody}`)
      if (!v3ProjectResponse.ok) {
        throw new Error(
          `MateCat status check failed for project ${project.projectId}: ` +
            `${v3ProjectResponse.status} ${v3ProjectResponse.statusText} ${projectBody}`
        )
      }

      const responseData = this.parseJsonObject(projectBody) ?? {}
      // API wraps response in a 'project' key
      const projectPayload = (responseData.project ?? responseData) as Record<string, unknown>

      // Extract jobs array which is already populated with complete ExtendedJob data
      const jobsArray = projectPayload.jobs
      const jobPayloads: Array<Record<string, unknown>> = Array.isArray(jobsArray) ? jobsArray : []

      // Build combined payload with jobs array for compatibility with existing stat extraction
      const statusPayload = this.combineProjectAndJobPayloads(projectPayload, jobPayloads)

      let percentDone: number | undefined
      let status = this.deriveStatusFromPayload(statusPayload)

      const chunkStatuses = this.getChunkStatuses(statusPayload)
      const statsPercentDone = this.extractPercentDoneFromChunkStats(statusPayload)

      // Prioritize stats-based completion over chunk status strings
      if (statsPercentDone !== undefined) {
        percentDone = statsPercentDone
        status = statsPercentDone >= 100 ? 'completed' : 'in_progress'
      } else if (chunkStatuses.length > 0) {
        percentDone = this.calculatePercentDone(chunkStatuses)
        status = this.reduceChunkStatuses(chunkStatuses)
      } else {
        percentDone = this.inferPercentDoneFromStatus(status)
      }

      statuses.push({
        projectId: project.projectId,
        status,
        percentDone,
        projectName: typeof projectPayload.name === 'string' ? projectPayload.name : undefined
      })
    }

    return statuses
  }

  public async deleteReviewProject(settings: MateCatSettings, project: IMateCatProjectRef): Promise<void> {
    const deleteUrl =
      `${MATECAT_BASE_URL}/api/v3/projects/${encodeURIComponent(project.projectId)}` +
      `/${encodeURIComponent(project.projectPass)}/delete`

    const deleteResponse = await this.httpClient.send(deleteUrl, {
      method: 'POST',
      headers: {
        [MATECAT_HEADER_KEY]: settings.apiKey
      }
    })

    const deleteBody = await deleteResponse.text()
    if (!deleteResponse.ok) {
      throw new Error(
        `MateCat project delete failed for project ${project.projectId}: ` +
          `${deleteResponse.status} ${deleteResponse.statusText} ${deleteBody}`
      )
    }

    this.logger.info(`MateCat project ${project.projectId} deleted successfully`)
  }
}