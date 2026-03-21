import { z } from 'zod'
import type { BulkTranslateOpts, Translator } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { withRetry } from '../util/retry'
import { normalizeLocaleWithMap } from '../util/localeNorm'
import { readFileSync } from 'node:fs'
import { toAbsPath } from '../core/util/pathShared'
import { createSign } from 'node:crypto'

/** Default endpoint for Google Cloud Translation API */
export const GOOGLE_DEFAULT_ENDPOINT = 'https://translation.googleapis.com'

/** Allowed domains for Google Translate endpoint validation */
export const GOOGLE_ALLOWED_DOMAINS = [
  'translation.googleapis.com',
  'generativelanguage.googleapis.com',
  '*.googleapis.com'
] as const

/** Google Cloud Translation config schema */
export const GoogleConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(GOOGLE_DEFAULT_ENDPOINT),
  googleProjectId: z.string().optional(),
  googleLocation: z.string().default('global'),
  model: z.string().optional(),
  timeoutMs: z.number().int().min(0).default(30_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred Google config type */
export type IGoogleConfig = z.infer<typeof GoogleConfigSchema>

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_TRANSLATION_SCOPE = 'https://www.googleapis.com/auth/cloud-translation'
const TOKEN_CACHE_TTL_MS = 15 * 60 * 1000

interface GoogleServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri?: string
}

interface GoogleTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
}

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

const tokenCache = new Map<string, CachedToken>()

/**
 * Clear the OAuth token cache. Useful for testing.
 * @internal
 */
export function clearTokenCache(): void {
  tokenCache.clear()
}

interface GoogleV3TranslateResponse {
  translations?: Array<{
    translatedText?: string
  }>
}

function resolveCredentialPath(keyOrPath: string, rootDir: string): string | null {
  if (keyOrPath.trim().startsWith('{')) return null
  return toAbsPath(keyOrPath, rootDir)
}

function describeCredentialSource(keyOrPath: string, rootDir: string): string {
  const resolved = resolveCredentialPath(keyOrPath, rootDir)
  return resolved === null ? 'inline-json' : `file-path (${resolved})`
}

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function parseServiceAccountCredentials(credentialsJson: string): GoogleServiceAccountCredentials {
  let parsed: unknown
  try {
    parsed = JSON.parse(credentialsJson)
  } catch (error) {
    throw new Error(`Google Translate v3: failed to parse service credentials JSON: ${String(error)}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Google Translate v3: invalid service credentials - expected JSON object')
  }

  const creds = parsed as Partial<GoogleServiceAccountCredentials>
  if (!creds.client_email || !creds.private_key) {
    throw new Error("Google Translate v3: service credentials missing 'client_email' or 'private_key'")
  }

  return {
    client_email: creds.client_email,
    private_key: creds.private_key,
    token_uri: creds.token_uri
  }
}

function readServiceAccountCredentials(keyOrPath: string, rootDir: string): GoogleServiceAccountCredentials {
  const resolvedPath = resolveCredentialPath(keyOrPath, rootDir)

  if (resolvedPath === null) {
    console.error('Google Translate v3: Credentials provided as inline JSON')
    return parseServiceAccountCredentials(keyOrPath)
  }

  console.error(`Google Translate v3: Loading credentials from file: ${resolvedPath}`)
  let fileContent: string
  try {
    fileContent = readFileSync(resolvedPath, 'utf-8')
    console.error('Google Translate v3: Successfully read credentials file')
  } catch (error) {
    throw new Error(`Google Translate v3: failed to read service credentials from '${keyOrPath}': ${String(error)}`)
  }

  return parseServiceAccountCredentials(fileContent)
}

function buildJwtAssertion(credentials: GoogleServiceAccountCredentials): string {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: credentials.client_email,
    scope: GOOGLE_TRANSLATION_SCOPE,
    aud: credentials.token_uri || GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }

  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedClaims = toBase64Url(JSON.stringify(claims))
  const unsignedToken = `${encodedHeader}.${encodedClaims}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer
    .sign(credentials.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `${unsignedToken}.${signature}`
}

async function requestGoogleAccessToken(pathToCredentials: string, rootDir: string, timeoutMs: number): Promise<string> {
  const cached = tokenCache.get(pathToCredentials)
  if (cached && cached.expiresAtMs > Date.now()) {
    console.error(`Google Translate v3: Using cached token (${describeCredentialSource(pathToCredentials, rootDir)})`)
    return cached.accessToken
  }

  console.error(`Google Translate v3: Requesting new access token (${describeCredentialSource(pathToCredentials, rootDir)})`)
  const credentials = readServiceAccountCredentials(pathToCredentials, rootDir)
  const assertion = buildJwtAssertion(credentials)
  const tokenUrl = credentials.token_uri || GOOGLE_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal
    })
    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${responseText}`)
    }

    const parsed = (responseText ? JSON.parse(responseText) : {}) as GoogleTokenResponse
    const accessToken = parsed.access_token
    if (!accessToken) {
      throw new Error(`Google OAuth token response missing 'access_token': ${responseText}`)
    }

    console.error(`Google Translate v3: Successfully obtained access token`)
    tokenCache.set(pathToCredentials, {
      accessToken,
      expiresAtMs: Date.now() + TOKEN_CACHE_TTL_MS
    })
    return accessToken
  } finally {
    clearTimeout(timer)
  }
}

export const GoogleTranslator: Translator<IGoogleConfig> = {
  name: 'google',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<IGoogleConfig>) {
    const cfg = opts.apiConfig
    const credentialsPath = cfg.apiKey
    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    const timeout = cfg.timeoutMs
    const retry = cfg.retry
    const model = cfg.model
    const projectId = cfg.googleProjectId
    const location = cfg.googleLocation
    const langMap = cfg.langMap

    if (!credentialsPath) throw new Error("Google Translate v3: missing 'apiKey' (path to service credential JSON)")
    if (!projectId) throw new Error("Google Translate v3: missing 'googleProjectId'")

    const rootDir = opts.rootDir
    console.error(`Google Translate v3: Credential source from config: ${describeCredentialSource(credentialsPath, rootDir)}`)
    const token = await withRetry(retry, () => requestGoogleAccessToken(credentialsPath, rootDir, timeout))

    const parent = `projects/${projectId}/locations/${location}`
    const url = `${endpoint}/v3/${parent}:translateText`
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const body: {
      contents: string[]
      sourceLanguageCode: string
      targetLanguageCode: string
      mimeType: 'text/plain'
      model?: string
    } = {
      sourceLanguageCode: normalizeLocaleWithMap(opts.sourceLocale, langMap),
      targetLanguageCode: normalizeLocaleWithMap(opts.targetLocale, langMap),
      contents: texts,
      mimeType: 'text/plain'
    }

    if (model) {
      body.model = model
    }

    const json = await withRetry(retry, () => postJson<GoogleV3TranslateResponse>(url, body, headers, timeout))
    const translations = json.translations || []
    return texts.map((text, index) => translations[index]?.translatedText ?? text)
  }
}
