import dotenv from 'dotenv'
import * as path from 'path'
import { Logger } from './logger'
import { FileSystem, nodeFileSystem } from './fs'

// Fallback env content if sample file is not available
const fallbackEnvContent = `# Azure Translation API configuration
# Get API key from: https://learn.microsoft.com/azure/ai-services/translator/translator-how-to-signup
AZURE_TRANSLATION_KEY='XXXXXXXXXXXXXXXXX'
AZURE_TRANSLATION_REGION='westus'
AZURE_TRANSLATION_URL='https://api.cognitive.microsofttranslator.com'

# Google Translate API configuration
# Get API key from: https://cloud.google.com/translate/docs/setup
GOOGLE_TRANSLATION_KEY='XXXXXXXXXXXXXXXXXXXXX'
GOOGLE_TRANSLATION_URL='https://translation.googleapis.com'

# DeepL API configuration
# Get API key from: https://www.deepl.com/pro-api
DEEPL_TRANSLATION_KEY='XXXXXXXXXXXXXXXXXXXXX'
DEEPL_TRANSLATION_URL='https://api-free.deepl.com'

# OpenRouter API configuration
# Get API key from: https://openrouter.ai/
OPENROUTER_API_KEY='XXXXXXXXXXXXXXXXXXXXX'
OPENROUTER_API_URL='https://openrouter.ai/api/v1/chat/completions'

# Gemini AI API configuration
# Get API key from: https://ai.google.dev/tutorials/setup
GEMINI_API_KEY='XXXXXXXXXXXXXXXXXXXXX'
GEMINI_API_URL='https://generativelanguage.googleapis.com/v1beta'

# You only need to configure keys for the translation services you plan to use
# See the extension settings to select which service to use for which file type
`

/**
 * Get the default env content from sample file or fallback
 */
async function getDefaultEnvContent(
  logger: Logger,
  fileSystem: FileSystem
): Promise<string> {
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
      logger.info('Sample file not found, using fallback content')
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

const warned = new Set<string>()

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
  return val
}

export function resolveEnvString(v: unknown, logger: Logger): unknown {
  if (typeof v !== 'string') return v
  const envRef = /^env:([A-Z0-9_]+)$/i.exec(v)
  if (envRef) {
    return getEnv(envRef[1], logger)
  }
  return v.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => getEnv(name, logger))
}

export function resolveEnvDeep<T = any>(obj: T, logger: Logger): T {
  if (obj == null || typeof obj !== 'object') return resolveEnvString(obj, logger) as T
  if (Array.isArray(obj)) return obj.map((v) => resolveEnvDeep(v, logger)) as any
  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) out[k] = resolveEnvDeep(v, logger)
  return out as T
}
