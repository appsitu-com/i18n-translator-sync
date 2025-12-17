import dotenv from 'dotenv'
import * as path from 'path'
import { Logger } from './baseLogger'
import { FileSystem, nodeFileSystem } from './fs'
import { isEncrypted, tryDecryptKey } from '../secrets/keyEncryption'


/**
 * Get the default env content from sample file or fallback
 */
async function getDefaultEnvContent(
  logger: Logger,
  fileSystem: FileSystem
): Promise<string> {
  const fallbackEnvContent = [
    '# Translator API keys',
    'AZURE_TRANSLATION_KEY=',
    'GOOGLE_TRANSLATION_KEY=',
    'DEEPL_API_KEY=',
    'OPENROUTER_API_KEY=',
    'GEMINI_API_KEY=',
    '# You only need to configure keys for the engines you use.',
    ''
  ].join('\n')
  try {
    // Try to find the sample file in the extension directory
    // This will work in development and when the sample file is packaged with the extension
    const extensionRoot = path.join(__dirname, '..', '..', '..')
    const sampleFilePath = path.join(extensionRoot, '.translator.env.sample')
    const sampleFileUri = fileSystem.createUri(sampleFilePath)

    logger.info(`Looking for sample file at: ${sampleFilePath}`)

    if (await fileSystem.fileExists(sampleFileUri)) {
      const content = await fileSystem.readFile(sampleFileUri)
      logger.info('Using content from .translator.env.sample file')
      return content
    } else {
      logger.info('Sample file not found')
      return fallbackEnvContent
    }
  } catch (error) {
    logger.warn(`Error reading sample file, using fallback content: ${error}`)
    return fallbackEnvContent
  }
}

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
 * Creates a default .translator.env file and adds it to .gitignore
 */
async function createDefaultTranslatorEnvFile(
  translatorEnvFile: string,
  gitignoreFile: string,
  logger: Logger,
  fileSystem: FileSystem,
  openDocument?: (path: string) => Promise<void>
): Promise<void> {
  logger.info('Creating default .translator.env file in workspace')

  // Get the default content from sample file or fallback
  const defaultEnvContent = await getDefaultEnvContent(logger, fileSystem)

  // Write the file
  await fileSystem.writeFile(fileSystem.createUri(translatorEnvFile), defaultEnvContent)

  // Add to .gitignore if it's not already there
  const gitignoreUri = fileSystem.createUri(gitignoreFile)
  const gitignoreExists = await fileSystem.fileExists(gitignoreUri)

  if (gitignoreExists) {
    const gitignoreContent = await fileSystem.readFile(gitignoreUri)

    if (!gitignoreContent.split('\n').some((line: string) => line.trim() === '.translator.env')) {
      await fileSystem.writeFile(gitignoreUri, gitignoreContent + '\n.translator.env\n')
    }
  } else {
    await fileSystem.writeFile(gitignoreUri, '.translator.env\n')
  }

  // Open the file if a handler is provided
  if (openDocument) {
    await openDocument(translatorEnvFile)
  }

  logger.info('Created default .translator.env file in your workspace. Please update it with your API keys.')
}

// Initialize environment from .translator.env file
export const initTranslatorEnv = async (
  rootDir: string,
  logger: Logger,
  fs?: FileSystem,
  openDocument?: (path: string) => Promise<void>
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
    const translatorEnvFile = path.join(rootDir, '.translator.env')
    const gitignoreFile = path.join(rootDir, '.gitignore')

    // Log the environment file path being checked
    logger.info(`Checking for environment file: ${translatorEnvFile}`)

    // Create .translator.env if it doesn't exist
    const envFileExists = await fileSystem.fileExists(fileSystem.createUri(translatorEnvFile))

    if (!envFileExists) {
      logger.info(`Environment file not found, creating: ${translatorEnvFile}`)
      await createDefaultTranslatorEnvFile(translatorEnvFile, gitignoreFile, logger, fileSystem, openDocument)
    } else {
      logger.info(`Loading environment from: ${translatorEnvFile}`)
    }

    // Load environment variables from .translator.env in the workspace
    dotenv.config({ path: translatorEnvFile, quiet: true })
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
        `${serviceInfo} API key missing. Configure "${name}" in your .translator.env file. Refer to ${docsUrl} for setup instructions.`
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
        `${serviceInfo} API key missing. Configure "${name}" in your .translator.env file. Refer to ${docsUrl} for setup instructions.`
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
 */
export function resolveEnvObjectWithDecryption<T = any>(
  obj: T,
  logger: Logger,
  getPassphrase?: GetPassphraseFunction
): T {
  if (obj == null || typeof obj !== 'object') {
    return resolveEnvStringWithDecryption(obj, logger, getPassphrase) as T
  }

  if (Array.isArray(obj)) {
    return obj.map(v => resolveEnvObjectWithDecryption(v, logger, getPassphrase)) as any
  }

  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) {
    out[k] = resolveEnvObjectWithDecryption(v, logger, getPassphrase)
  }

  return out as T
}

/**
 * Synchronous version - only use for unencrypted values
 */
export function resolveEnvString(v: unknown, logger: Logger): unknown {
  if (typeof v !== 'string') return v
  const envRef = /^env:([A-Z0-9_]+)$/i.exec(v)
  if (envRef) {
    return getEnv(envRef[1], logger)
  }
  return v.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => getEnv(name, logger))
}

/**
 * Synchronous version - only use for unencrypted values
 */
export function resolveEnvDeep<T = any>(obj: T, logger: Logger): T {
  if (obj == null || typeof obj !== 'object') return resolveEnvString(obj, logger) as T
  if (Array.isArray(obj)) return obj.map((v) => resolveEnvDeep(v, logger)) as any
  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) out[k] = resolveEnvDeep(v, logger)
  return out as T
}
