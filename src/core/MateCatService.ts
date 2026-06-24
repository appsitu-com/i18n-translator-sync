import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import JSON5 from 'json5'
import { MATECAT_JSON } from './constants'
import { ILogger, NO_OP_LOGGER } from './util/baseLogger'
import { ITranslationMemory } from './tm/ITranslationMemory'

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
type MateCatFormValue = MateCatFormScalar | MateCatFormScalar[]

export type MateCatNewProjectDefaults = Record<string, MateCatFormValue>

/**
 * MateCat integration settings
 */
export type MateCatSettings = {
  apiKey: string
  newProjectDefaults: MateCatNewProjectDefaults
}

export interface IMateCatService {
  pushTmToMateCat(
    tm: ITranslationMemory,
    settings: MateCatSettings,
    runtimeFields?: MateCatRuntimeNewProjectFields,
    notifyCallback?: (message: string) => void
  ): Promise<void>

  pullReviewedFromMateCat(
    tm: ITranslationMemory,
    settings: MateCatSettings,
    notifyCallback?: (message: string) => void
  ): Promise<number>
}

export type MateCatSettingsLoader = (workspacePath: string, logger?: ILogger) => MateCatSettings

export interface IMateCatHttpResponse {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
}


export interface IMateCatHttpClient {
  send(url: string, request: { method: string; headers: Record<string, string>; body: Buffer }): Promise<IMateCatHttpResponse>
}

class DefaultMateCatHttpClient implements IMateCatHttpClient {
  async send(
    url: string,
    request: { method: string; headers: Record<string, string>; body: Buffer }
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

function isFormValue(value: unknown): value is MateCatFormValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
  )
}

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

  const defaults: MateCatNewProjectDefaults = {}
  for (const [key, value] of Object.entries(defaultsCandidate)) {
    if (!isFormValue(value)) {
      throw new Error(`matecat.json field "${key}" must be a scalar or scalar-array value`)
    }

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
  const apiKey = process.env.MATECAT_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Missing MATECAT_API_KEY in translator.env or process.env')
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

  private appendMultipartFile(chunks: Buffer[], boundary: string, fieldName: string, fileName: string, content: Buffer): void {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'))
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
          'Content-Type: text/csv\r\n\r\n',
        'utf8'
      )
    )
    chunks.push(content)
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }

  /**
   * Push translation cache to MateCat for review
   */
  public async pushTmToMateCat(
    tm: ITranslationMemory,
    settings: MateCatSettings,
    runtimeFields: MateCatRuntimeNewProjectFields = {},
    notifyCallback?: (message: string) => void
  ): Promise<void> {
    const mergedFields: MateCatNewProjectDefaults = {
      ...settings.newProjectDefaults,
      ...runtimeFields
    }

    // files[] is always computed by this integration from the exported TM CSV payload.
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

    const url = `${MATECAT_BASE_URL}${MATECAT_NEW_PROJECT_PATH}`

    this.logger.info(`Pushing translations to MateCat: ${url}`)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matecat-'))
    const csvPath = path.join(tmpDir, 'translations.csv')
    await tm.exportCSV(csvPath)
    const boundary = `----mcform${Math.random().toString(16).slice(2)}`
    const bodyParts: Buffer[] = []

    for (const [name, value] of Object.entries(filteredFields)) {
      this.appendMultipartField(bodyParts, boundary, name, value)
    }

    this.appendMultipartFile(bodyParts, boundary, 'files[]', 'translations.csv', fs.readFileSync(csvPath))
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
        throw new Error(`MateCat push failed: ${res.status} ${res.statusText} ${txt}`)
      }

      this.logger.info('Successfully pushed translations to MateCat')

      if (notifyCallback) {
        notifyCallback('MateCat: new project created with uploaded review file(s).')
      }
    } catch (error) {
      this.logger.error(`Error pushing to MateCat: ${error}`)
      throw error
    }
  }

  /**
   * Pull reviewed translations from MateCat
   */
  public async pullReviewedFromMateCat(
    _tm: ITranslationMemory,
    _settings: MateCatSettings,
    _notifyCallback?: (message: string) => void
  ): Promise<number> {
    throw new Error('MateCat review pull workflow is not implemented yet')
  }
}