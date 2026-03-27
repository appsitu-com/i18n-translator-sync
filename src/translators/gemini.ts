import { z } from 'zod'
import type { Translator, BulkTranslateOpts } from './types'
import { LangMapSchema, RetrySchema } from './sharedSchemas'
import { postJson } from '../util/http'
import { normalizeLocaleWithMap } from '../util/localeNorm'

/** Default endpoint for Gemini API */
export const GEMINI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

/** Default model for Gemini API */
export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash'

/** Allowed domains for Gemini endpoint validation */
export const GEMINI_ALLOWED_DOMAINS = [
  'generativelanguage.googleapis.com',
  '*.googleapis.com'
] as const

/** Google Gemini (LLM-based translation) config schema */
export const GeminiConfigSchema = z.object({
  apiKey: z.string().optional(),
  endpoint: z.string().default(GEMINI_DEFAULT_ENDPOINT),
  model: z.string().default(GEMINI_DEFAULT_MODEL),
  temperature: z.number().min(0).max(2).default(0.1),
  maxOutputTokens: z.number().int().min(1).default(1024),
  timeoutMs: z.number().int().min(0).default(60_000),
  retry: RetrySchema,
  langMap: LangMapSchema
})

/** Inferred Gemini config type */
export type IGeminiConfig = z.infer<typeof GeminiConfigSchema>

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

interface GeminiModelListResponse {
  models?: Array<{
    name?: string
    supportedGenerationMethods?: string[]
  }>
}

const latestFlashModelCache = new Map<string, string | null>()
const latestFlashModelDiscoveryInFlight = new Map<string, Promise<string | null>>()

function buildBatchPrompt(
  texts: string[],
  contexts: (string | null | undefined)[],
  sourceLocale: string,
  targetLocale: string
): string {
  const contextSection = contexts.some(Boolean)
    ? '\nContext hints (aligned by index):\n' +
      contexts.map((ctx, i) => `${i}: ${ctx ?? '(none)'}`).join('\n')
    : ''

  return [
    `Translate each text from ${sourceLocale} to ${targetLocale}.`,
    'Return ONLY a JSON array of translated strings in the same order.',
    'Do not add explanations, numbers, markdown fences, or extra text.',
    contextSection,
    '',
    'Input texts (JSON array):',
    JSON.stringify(texts)
  ]
    .filter(s => s !== '')
    .join('\n')
}

function parseJsonArrayResponse(responseText: string, expectedCount: number): string[] {
  const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed: unknown = JSON.parse(cleaned)

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error(
      `Gemini Translator: expected ${expectedCount} translations but got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`
    )
  }

  return parsed.map(item => String(item).trim())
}

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('is not found for API version') ||
    message.includes('not supported for generateContent') ||
    message.includes('NOT_FOUND')
  )
}

function normalizeModelName(name: string): string {
  return name.replace(/^models\//, '')
}

function parseFlashModelVersion(modelName: string): [number, number] | undefined {
  const normalized = normalizeModelName(modelName)
  const match = normalized.match(/^gemini-(\d+)(?:\.(\d+))?-flash(?:$|-)/i)
  if (!match) {
    return undefined
  }

  const major = Number(match[1])
  const minor = Number(match[2] ?? '0')
  return [major, minor]
}

function pickLatestFlashModel(modelNames: string[]): string | undefined {
  const candidates = modelNames
    .filter(name => /gemini-\d+(?:\.\d+)?-flash/i.test(name))
    .filter(name => !/-exp/i.test(name))

  candidates.sort((a, b) => {
    const av = parseFlashModelVersion(a) ?? [0, 0]
    const bv = parseFlashModelVersion(b) ?? [0, 0]
    if (av[0] !== bv[0]) {
      return bv[0] - av[0]
    }
    if (av[1] !== bv[1]) {
      return bv[1] - av[1]
    }

    const aLite = /-flash-lite/i.test(a)
    const bLite = /-flash-lite/i.test(b)
    if (aLite !== bLite) {
      return aLite ? 1 : -1
    }

    return a.localeCompare(b)
  })

  return candidates[0]
}

async function discoverLatestFlashModel(endpoint: string, apiKey: string, timeoutMs: number): Promise<string | undefined> {
  const endpointKey = endpoint.replace(/\/+$/, '')
  if (latestFlashModelCache.has(endpointKey)) {
    return latestFlashModelCache.get(endpointKey) ?? undefined
  }

  const inFlight = latestFlashModelDiscoveryInFlight.get(endpointKey)
  if (inFlight) {
    return (await inFlight) ?? undefined
  }

  const discoveryPromise = (async (): Promise<string | null> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const url = `${endpointKey}/models?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, { method: 'GET', signal: controller.signal })
      if (!response.ok) {
        latestFlashModelCache.set(endpointKey, null)
        return null
      }

      const payload = (await response.json()) as GeminiModelListResponse
      const modelNames = (payload.models ?? [])
        .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
        .map(model => model.name)
        .filter((name): name is string => typeof name === 'string')
        .map(normalizeModelName)

      const latest = pickLatestFlashModel(modelNames) ?? null
      latestFlashModelCache.set(endpointKey, latest)
      return latest
    } catch {
      latestFlashModelCache.set(endpointKey, null)
      return null
    } finally {
      clearTimeout(timeout)
      latestFlashModelDiscoveryInFlight.delete(endpointKey)
    }
  })()

  latestFlashModelDiscoveryInFlight.set(endpointKey, discoveryPromise)

  return (await discoveryPromise) ?? undefined
}

async function requestTranslation(
  endpoint: string,
  model: string,
  apiKey: string,
  body: {
    contents: Array<{ parts: Array<{ text: string }> }>
    generation_config: { temperature: number; max_output_tokens: number }
  },
  timeoutMs: number,
  retry: z.infer<typeof RetrySchema>
): Promise<GeminiGenerateResponse> {
  const url = `${endpoint.replace(/\/+$/, '')}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const maxRetries = retry?.maxRetries ?? 2
  const baseDelayMs = retry?.delayMs ?? 100
  const backoffFactor = retry?.backoffFactor ?? 2

  let attempt = 0
  while (true) {
    try {
      return await postJson<GeminiGenerateResponse>(url, body, {}, timeoutMs)
    } catch (error) {
      if (isModelUnavailableError(error) || attempt >= maxRetries) {
        throw error
      }

      const delayMs = baseDelayMs * Math.pow(backoffFactor, attempt)
      attempt += 1
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}


export const GeminiTranslator: Translator<IGeminiConfig> = {
  name: 'gemini',

  async translateMany(texts: string[], _contexts: (string | null | undefined)[], opts: BulkTranslateOpts<IGeminiConfig>) {
    const cfg = opts.apiConfig
    if (!cfg.apiKey) throw new Error(`Gemini Translate: missing 'apiKey'`)

    const sourceLocale = normalizeLocaleWithMap(opts.sourceLocale, cfg.langMap)
    const targetLocale = normalizeLocaleWithMap(opts.targetLocale, cfg.langMap)
    const prompt = buildBatchPrompt(texts, _contexts, sourceLocale, targetLocale)
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generation_config: { temperature: cfg.temperature, max_output_tokens: cfg.maxOutputTokens }
    }

    const endpoint = cfg.endpoint.replace(/\/+$/, '')
    let configuredModel = cfg.model

    // When using the built-in default, prefer the latest discoverable Flash model.
    if (configuredModel === GEMINI_DEFAULT_MODEL) {
      const latestFlashModel = await discoverLatestFlashModel(endpoint, cfg.apiKey, cfg.timeoutMs)
      if (latestFlashModel) {
        configuredModel = latestFlashModel
      }
    }

    let json: GeminiGenerateResponse
    try {
      json = await requestTranslation(endpoint, configuredModel, cfg.apiKey, body, cfg.timeoutMs, cfg.retry)
    } catch (error) {
      if (!isModelUnavailableError(error)) {
        throw error
      }

      const latestFlashModel = await discoverLatestFlashModel(endpoint, cfg.apiKey, cfg.timeoutMs)
      if (!latestFlashModel || latestFlashModel === configuredModel) {
        throw error
      }

      json = await requestTranslation(endpoint, latestFlashModel, cfg.apiKey, body, cfg.timeoutMs, cfg.retry)
    }

    const responseText: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text

    if (typeof responseText !== 'string' || !responseText.trim()) {
      throw new Error('Gemini Translator: empty or missing response content')
    }

    return parseJsonArrayResponse(responseText, texts.length)
  }
}
