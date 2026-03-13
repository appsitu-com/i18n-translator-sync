import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import JSON5 from 'json5'
import { TranslatorConfigSchema, ITranslatorConfig } from './translatorConfigSchema'
import { EnvVarsSchema, IEnvVars } from './envVarsSchema'
import { TRANSLATOR_ENV, TRANSLATOR_JSON } from '../constants'
import { Logger } from '../util/baseLogger'
import { formatZodError } from '../util/formatZodError'
import { isEncrypted, tryDecryptKey } from '../secrets/keyEncryption'

/** Function that returns a passphrase for decrypting encrypted env values. */
export type GetPassphrase = () => string | undefined

export class MissingEnvironmentValueError extends Error {
  constructor(public readonly variableName: string) {
    super(
      `Missing required environment value "${variableName}". Set it in process.env, translator.env, or directly in translator.json.`
    )
    this.name = 'MissingEnvironmentValueError'
  }
}

interface EnvValueAccessor {
  get(name: string): string
}

// ---------------------------------------------------------------------------
// Step 1 — Load environment variables
// ---------------------------------------------------------------------------

/**
 * Load translator.env (if it exists) into process.env via dotenv,
 * then snapshot the known env vars into a typed IEnvVars object.
 *
 * @param rootDir   Workspace / project root directory
 * @param logger    Logger for diagnostic output
 * @returns A typed snapshot of the relevant environment variables
 */
export function loadEnvVars(rootDir: string, logger: Logger): IEnvVars {
  const envPath = path.join(rootDir, TRANSLATOR_ENV)

  if (fs.existsSync(envPath)) {
    logger.info(`Loading environment from: ${envPath}`)
    process.env.I18N_TRANSLATOR_ENV_DIR = path.dirname(envPath)

    const result = dotenv.config({ path: envPath })
    if (result.error) {
      logger.error(`Failed to load ${TRANSLATOR_ENV}: ${result.error.message}`)
    } else {
      const loadedKeys = Object.keys(result.parsed ?? {})
      logger.info(`Loaded ${loadedKeys.length} env vars from ${TRANSLATOR_ENV}`)
    }
  } else {
    logger.warn(`${TRANSLATOR_ENV} not found at ${envPath}`)
  }

  // Snapshot only the keys we care about from process.env
  return snapshotEnvVars()
}

/**
 * Build an IEnvVars object from the current process.env.
 * Unknown keys are silently dropped by the Zod schema.
 */
export function snapshotEnvVars(): IEnvVars {
  return EnvVarsSchema.parse(process.env)
}

// ---------------------------------------------------------------------------
// Step 2 — Resolve ${VAR} placeholders in the raw JSON
// ---------------------------------------------------------------------------

/**
 * Recursively walk a JSON value (parsed from translator.json) and replace
 * every `${VAR_NAME}` occurrence in string values with the corresponding
 * value from the supplied `envVars`.
 *
 * Handles the `env:VAR_NAME` shorthand as well (entire string is the value).
 *
 * Encrypted values (prefixed with `ENC:`) are decrypted when a `getPassphrase`
 * function is provided.
 */
export function resolveConfigEnvVars(
  value: unknown,
  envVars: IEnvVars,
  logger: Logger,
  getPassphrase?: GetPassphrase
): unknown {
  const envAccessor = createEnvValueAccessor(envVars)

  if (typeof value === 'string') {
    return resolveString(value, envAccessor, logger, getPassphrase)
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveValue(item, envAccessor, logger, getPassphrase)
    )
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveValue(v, envAccessor, logger, getPassphrase)
    }
    return out
  }

  // numbers, booleans, null — pass through
  return value
}

// ---------------------------------------------------------------------------
// Step 3 — Parse + validate → ITranslatorConfig
// ---------------------------------------------------------------------------

export interface LoadConfigResult {
  config: ITranslatorConfig
  errors: string[]
}

/**
 * End-to-end config loader:
 *   1. Load translator.env → process.env → IEnvVars
 *   2. Read translator.json (JSON5)
 *   3. Resolve ${VAR} references using IEnvVars
 *   4. Validate with Zod → ITranslatorConfig
 *
 * @param rootDir        Workspace / project root
 * @param logger         Diagnostic logger
 * @param getPassphrase  Optional passphrase supplier for encrypted keys
 * @returns The validated config and any validation errors
 */
export function loadTranslatorConfig(
  rootDir: string,
  logger: Logger,
  getPassphrase?: GetPassphrase
): LoadConfigResult {
  // 1. Load env vars
  const envVars = loadEnvVars(rootDir, logger)

  // 2. Read translator.json
  const configPath = path.join(rootDir, TRANSLATOR_JSON)
  let rawJson: unknown = {}

  if (fs.existsSync(configPath)) {
    logger.info(`Loading config from: ${configPath}`)
    const content = fs.readFileSync(configPath, 'utf8')
    rawJson = JSON5.parse(content)
  } else {
    logger.warn(`${TRANSLATOR_JSON} not found at ${configPath} — using defaults`)
  }

  // 3. Resolve env var references
  const resolved = resolveConfigEnvVars(rawJson, envVars, logger, getPassphrase)

  // 4. Validate with Zod
  const result = TranslatorConfigSchema.safeParse(resolved)

  if (result.success) {
    return { config: result.data, errors: [] }
  }

  const errors = formatZodError(result.error)
  logger.error(`Invalid ${TRANSLATOR_JSON}:\n${errors.join('\n')}`)

  // Fall back to parsing what we can (defaults will fill gaps)
  const fallback = TranslatorConfigSchema.safeParse({})
  return {
    config: fallback.success ? fallback.data : ({} as ITranslatorConfig),
    errors
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a single string value:
 *  - `env:VAR_NAME`  → full replacement from envVars or process.env
 *  - `${VAR_NAME}`   → inline substitution (multiple allowed)
 *  - `ENC:…`         → decrypt using passphrase
 */
function resolveString(
  value: string,
  envAccessor: EnvValueAccessor,
  logger: Logger,
  getPassphrase?: GetPassphrase
): string {
  // env:VAR_NAME — whole-string reference
  const envRef = /^env:([A-Z0-9_]+)$/i.exec(value)
  if (envRef) {
    const raw = envAccessor.get(envRef[1])
    return decryptIfNeeded(raw, envRef[1], logger, getPassphrase)
  }

  // ${VAR_NAME} — inline substitution (one or more)
  const resolved = value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, varName: string) => {
    const raw = envAccessor.get(varName)
    return decryptIfNeeded(raw, varName, logger, getPassphrase)
  })

  return resolved
}

/**
 * Look up a variable first from our typed IEnvVars snapshot,
 * falling back to process.env for any vars not in the schema.
 */
function resolveValue(
  value: unknown,
  envAccessor: EnvValueAccessor,
  logger: Logger,
  getPassphrase?: GetPassphrase
): unknown {
  if (typeof value === 'string') {
    return resolveString(value, envAccessor, logger, getPassphrase)
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, envAccessor, logger, getPassphrase))
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveValue(v, envAccessor, logger, getPassphrase)
    }
    return out
  }

  return value
}

function createEnvValueAccessor(envVars: IEnvVars): EnvValueAccessor {
  return {
    get(name: string): string {
      const typed = (envVars as Record<string, string | undefined>)[name]
      const resolved = typed ?? process.env[name]

      if (resolved === undefined || resolved === '') {
        throw new MissingEnvironmentValueError(name)
      }

      return resolved
    }
  }
}

/**
 * If the value carries an `ENC:` prefix, attempt decryption.
 */
function decryptIfNeeded(
  value: string,
  varName: string,
  logger: Logger,
  getPassphrase?: GetPassphrase
): string {
  if (!isEncrypted(value)) return value

  if (!getPassphrase) {
    logger.warn(
      `Encrypted value for "${varName}" cannot be decrypted without a passphrase`
    )
    return value
  }

  const passphrase = getPassphrase()
  if (!passphrase) {
    logger.warn(`No passphrase available to decrypt "${varName}"`)
    return value
  }

  const decrypted = tryDecryptKey(value, passphrase)
  return decrypted ?? value
}
