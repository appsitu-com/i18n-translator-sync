import dotenv from 'dotenv'
import * as path from 'path'
import { Logger } from './baseLogger'
import { FileSystem, nodeFileSystem } from './fs'
import { isEncrypted, tryDecryptKey } from '../secrets/keyEncryption'
import { TRANSLATOR_ENV } from '../constants'


/**
 * Get the appropriate FileSystem implementation
 */
function getFileSystem(fs?: FileSystem): FileSystem {
  return fs || nodeFileSystem
}

// This flag tracks if the environment has been initialized
let isEnvInitialized = false

/**
 * Reset the initialization flag - used for testing
 */
export function resetEnvInitialization(): void {
  isEnvInitialized = false
}

/**
 * Load environment variables from translator.env file.
 * The translator.env file is created from samples/ by checkAndCreateConfigFiles()
 * in extension.ts during Translator Start — this function only loads it.
 */
export const initTranslatorEnv = async (
  rootDir: string,
  logger: Logger,
  fs?: FileSystem
): Promise<void> => {
  // Skip if already initialized
  if (isEnvInitialized) {
    return
  }

  try {
    if (!rootDir) {
      logger.warn('Could not determine workspace directory')
      return
    }

    const fileSystem = getFileSystem(fs)
    const translatorEnvFile = path.join(rootDir, TRANSLATOR_ENV)

    // Log the environment file path being checked
    logger.info(`Checking for environment file: ${translatorEnvFile}`)

    const envFileExists = await fileSystem.fileExists(fileSystem.createUri(translatorEnvFile))

    if (!envFileExists) {
      logger.warn(`Environment file not found: ${translatorEnvFile}. Run "Translator: Start" to create it.`)
    } else {
      logger.info(`Loading environment from: ${translatorEnvFile}`)
      process.env.I18N_TRANSLATOR_ENV_DIR = path.dirname(translatorEnvFile)
      // Load environment variables from translator.env in the workspace
      const result = dotenv.config({ path: translatorEnvFile, quiet: true })

      if (result.error) {
        logger.error(`Failed to load environment file: ${result.error.message}`)
      } else {
        // Log which environment variables were successfully loaded
        const loadedKeys = Object.keys(result.parsed || {})
        logger.info(`Successfully loaded ${loadedKeys.length} environment variables from ${translatorEnvFile}`)
        logger.debug(`Loaded keys from file: ${loadedKeys.join(', ')}`)

        // Log the presence of translation service keys (without exposing values)
        const translationKeys = ['GOOGLE_TRANSLATION_KEY', 'GOOGLE_TRANSLATION_PROJECT_ID', 'AZURE_TRANSLATION_KEY', 'DEEPL_TRANSLATION_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY']
        for (const key of translationKeys) {
          if (process.env[key]) {
            const value = process.env[key] || ''
            const masked = value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '[too short]'
            logger.debug(`✓ ${key} is configured in process.env: ${masked}`)
          } else {
            logger.warn(`✗ ${key} is not configured in process.env`)
            logger.warn(`If you intend to use this translation service, please set this key in your translator.env file.`)
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error initializing environment: ${error}`)
  }

  // Mark as initialized
  isEnvInitialized = true
}

export class MissingEnvVarError extends Error {
  constructor(public readonly varName: string) {
    super(`Environment variable "${varName}" is not set`)
    this.name = 'MissingEnvVarError'
  }
}

export class EncryptedKeyAccessError extends Error {
  constructor(public readonly varName: string) {
    super(`Cannot access encrypted key "${varName}" without a passphrase`)
    this.name = 'EncryptedKeyAccessError'
  }
}

const warned = new Set<string>()

/**
 * Get a passphrase function type definition
 */
export type GetPassphraseFunction = () => string | undefined;

/**
 * Get an environment variable, decrypting if necessary
 * @param name The name of the environment variable
 * @param logger The logger instance
 * @param getPassphrase Optional function to get the passphrase for decryption
 * @returns The value of the environment variable
 */
export function getEnvWithDecryption(
  name: string,
  logger: Logger,
  getPassphrase?: GetPassphraseFunction
): string {
  const val = process.env[name]
  if (!val) {
    if (!warned.has(name)) {
      warned.add(name)

      // Determine which API service needs a key
      let serviceInfo = ''
      let docsUrl = ''

      if (name.includes('AZURE')) {
        serviceInfo = 'Azure Translator'
        docsUrl = 'https://learn.microsoft.com/azure/ai-services/translator/translator-how-to-signup'
      } else if (name.includes('GOOGLE')) {
        serviceInfo = 'Google Translate'
        docsUrl = 'https://cloud.google.com/translate/docs/setup'
      } else if (name.includes('DEEPL')) {
        serviceInfo = 'DeepL'
        docsUrl = 'https://www.deepl.com/pro-api'
      } else if (name.includes('OPENROUTER')) {
        serviceInfo = 'OpenRouter'
        docsUrl = 'https://openrouter.ai/'
      } else if (name.includes('GEMINI')) {
        serviceInfo = 'Gemini AI'
        docsUrl = 'https://ai.google.dev/tutorials/setup'
      }

      logger.error(
        `${serviceInfo} API key missing. Configure "${name}" in your translator.env file. Refer to ${docsUrl} for setup instructions.`
      )
    }
    throw new MissingEnvVarError(name)
  }

  // Check if the value is encrypted and needs to be decrypted
  if (isEncrypted(val)) {
    if (!getPassphrase) {
      // Log the error
      logger.error(`Cannot access encrypted key "${name}" without a passphrase. Please run the "Set Up Encryption" command.`)
      // Throw specialized error
      throw new EncryptedKeyAccessError(name)
    }

    const passphrase = getPassphrase()
    if (!passphrase) {
      logger.error(`No passphrase available to decrypt key "${name}"`)
      throw new EncryptedKeyAccessError(name)
    }

    try {
      const decryptedKey = tryDecryptKey(val, passphrase)
      return decryptedKey || ''
    } catch (error) {
      logger.error(`Failed to decrypt key "${name}": ${error}`)
      throw new Error(`Failed to decrypt key "${name}": ${error}`)
    }
  }

  return val
}

/**
 * Get an environment variable (synchronous version - only use for unencrypted values)
 * @param name The name of the environment variable
 * @param logger The logger instance
 * @returns The value of the environment variable
 */
export function getEnv(name: string, logger: Logger): string {
  const val = process.env[name]
  if (!val) {
    if (!warned.has(name)) {
      warned.add(name)

      // Determine which API service needs a key
      let serviceInfo = ''
      let docsUrl = ''

      if (name.includes('AZURE')) {
        serviceInfo = 'Azure Translator'
        docsUrl = 'https://learn.microsoft.com/azure/ai-services/translator/translator-how-to-signup'
      } else if (name.includes('GOOGLE')) {
        serviceInfo = 'Google Translate'
        docsUrl = 'https://cloud.google.com/translate/docs/setup'
      } else if (name.includes('DEEPL')) {
        serviceInfo = 'DeepL'
        docsUrl = 'https://www.deepl.com/pro-api'
      } else if (name.includes('OPENROUTER')) {
        serviceInfo = 'OpenRouter'
        docsUrl = 'https://openrouter.ai/'
      } else if (name.includes('GEMINI')) {
        serviceInfo = 'Gemini AI'
        docsUrl = 'https://ai.google.dev/tutorials/setup'
      }

      // In test environment, skip the UI part
      logger.error(
        `${serviceInfo} API key missing. Configure "${name}" in your translator.env file. Refer to ${docsUrl} for setup instructions.`
      )
    }
    throw new MissingEnvVarError(name)
  }

  // Check if encrypted and warn
  if (isEncrypted(val)) {
    if (!warned.has(`encrypted:${name}`)) {
      warned.add(`encrypted:${name}`)
      logger.warn(`The key "${name}" is encrypted and cannot be accessed without a passphrase. Use getEnvWithDecryption instead.`)
    }
  }

  return val
}

/**
 * Resolve an environment variable reference in a string
 * @param v The value to resolve
 * @param logger The logger instance
 * @param getPassphrase Optional function to get the passphrase for decryption
 */
export function resolveEnvStringWithDecryption(
  v: unknown,
  logger: Logger,
  getPassphrase?: GetPassphraseFunction
): unknown {
  if (typeof v !== 'string') return v

  const envRef = /^env:([A-Z0-9_]+)$/i.exec(v)
  if (envRef) {
    return getEnvWithDecryption(envRef[1], logger, getPassphrase)
  }

  // Handle ${VAR} replacements
  const matches = v.match(/\$\{([A-Z0-9_]+)\}/gi) || [];
  let result = v;

  for (const match of matches) {
    const varName = match.slice(2, -1); // Remove ${ and }
    const value = getEnvWithDecryption(varName, logger, getPassphrase);
    result = result.replace(match, value);
  }

  return result;
}

/**
 * Resolve environment references in an object with decryption support
 * @param obj The object to resolve
 * @param logger The logger instance
 * @param getPassphrase Optional function to get the passphrase for decryption
 * @param workspacePath Optional workspace path for resolving relative file paths
 */
export function resolveEnvObjectWithDecryption<T = any>(
  obj: T,
  logger: Logger,
  getPassphrase?: GetPassphraseFunction,
  workspacePath?: string
): T {
  if (obj == null || typeof obj !== 'object') {
    return resolveEnvStringWithDecryption(obj, logger, getPassphrase) as T
  }

  if (Array.isArray(obj)) {
    return obj.map(v => resolveEnvObjectWithDecryption(v, logger, getPassphrase, workspacePath)) as any
  }

  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) {
    const resolved = resolveEnvObjectWithDecryption(v, logger, getPassphrase, workspacePath)
    // Do not coerce generic `key` fields into filesystem paths.
    // Some engines (e.g., Azure) use `key` for API credentials, not file paths.
    out[k] = resolved
  }

  return out as T
}

/**
 * Synchronous version - only use for unencrypted values
 * @param v The value to resolve
 * @param logger The logger instance
 * @param workspacePath Optional workspace path for resolving relative file paths
 */
export function resolveEnvString(v: unknown, logger: Logger, _workspacePath?: string): unknown {
  if (typeof v !== 'string') return v
  const envRef = /^env:([A-Z0-9_]+)$/i.exec(v)
  if (envRef) {
    return getEnv(envRef[1], logger)
  }
  return v.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => getEnv(name, logger))
}

/**
 * Synchronous version - only use for unencrypted values
 * @param obj The object to resolve
 * @param logger The logger instance
 * @param workspacePath Optional workspace path for resolving relative file paths
 */
export function resolveEnvDeep<T = any>(obj: T, logger: Logger, workspacePath?: string): T {
  if (obj == null || typeof obj !== 'object') return resolveEnvString(obj, logger, workspacePath) as T
  if (Array.isArray(obj)) return obj.map((v) => resolveEnvDeep(v, logger, workspacePath)) as any
  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) {
    const resolved = resolveEnvDeep(v, logger, workspacePath)
    // Do not coerce generic `key` fields into filesystem paths.
    // Some engines (e.g., Azure) use `key` for API credentials, not file paths.
    out[k] = resolved
  }
  return out as T
}
