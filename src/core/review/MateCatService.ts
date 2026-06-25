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

  private tryExtractUrls(responseBody: string): string[] {
    try {
      const parsed = JSON.parse(responseBody) as unknown

      if (parsed && typeof parsed === 'object') {
        const parsedRecord = parsed as Record<string, unknown>
        const filesCandidate = parsedRecord.files
        if (Array.isArray(filesCandidate)) {
          const urlsFromFiles = filesCandidate
            .flatMap((fileItem) => {
              if (!fileItem || typeof fileItem !== 'object') {
                return []
              }

              const fileRecord = fileItem as Record<string, unknown>
              const xliffUrl = fileRecord.xliff_download_url
              if (typeof xliffUrl === 'string' && xliffUrl.trim().length > 0) {
                return [xliffUrl.trim()]
              }

              return []
            })

          if (urlsFromFiles.length > 0) {
            return Array.from(new Set(urlsFromFiles))
          }
        }
      }

      const urls: string[] = []

      const collectUrls = (value: unknown): void => {
        if (typeof value === 'string') {
          if (value.startsWith('http://') || value.startsWith('https://')) {
            urls.push(value)
          }
          return
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            collectUrls(item)
          }
          return
        }

        if (value && typeof value === 'object') {
          for (const entry of Object.values(value as Record<string, unknown>)) {
            collectUrls(entry)
          }
        }
      }

      collectUrls(parsed)
      return Array.from(new Set(urls))
    } catch {
      return responseBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('http://') || line.startsWith('https://'))
    }
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
      const urlEndpoint = `${MATECAT_BASE_URL}/api/v3/projects/${encodeURIComponent(project.projectId)}/${encodeURIComponent(project.projectPass)}/urls`
      const urlResponse = await this.httpClient.send(urlEndpoint, {
        method: 'GET',
        headers: {
          [MATECAT_HEADER_KEY]: settings.apiKey
        }
      })

      const urlBody = await urlResponse.text()
      if (!urlResponse.ok) {
        throw new Error(`MateCat URL fetch failed for project ${project.projectId}: ${urlResponse.status} ${urlResponse.statusText} ${urlBody}`)
      }

      const downloadUrls = this.tryExtractUrls(urlBody)
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
      const v3StatusUrl =
        `${MATECAT_BASE_URL}/api/v3/projects/${encodeURIComponent(project.projectId)}` +
        `/${encodeURIComponent(project.projectPass)}/analysis/status`
      const v3StatusResponse = await this.httpClient.send(v3StatusUrl, {
        method: 'GET',
        headers: {
          [MATECAT_HEADER_KEY]: settings.apiKey
        }
      })

      const statusBody = await v3StatusResponse.text()
      if (!v3StatusResponse.ok) {
        throw new Error(
          `MateCat status check failed for project ${project.projectId}: ` +
            `${v3StatusResponse.status} ${v3StatusResponse.statusText} ${statusBody}`
        )
      }

      let status = 'unknown'
      try {
        const parsed = JSON.parse(statusBody) as Record<string, unknown>
        const summary = parsed.summary && typeof parsed.summary === 'object'
          ? (parsed.summary as Record<string, unknown>)
          : undefined
        const candidate = parsed.status ?? parsed.project_status ?? parsed.STATUS ?? summary?.STATUS
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          status = candidate.trim().toLowerCase()
        }
      } catch {
        // Keep the fallback 'unknown' status for non-JSON responses.
      }

      statuses.push({
        projectId: project.projectId,
        status
      })
    }

    return statuses
  }
}