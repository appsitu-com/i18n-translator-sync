import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import JSON5 from 'json5'
import {
  loadEnvVars,
  snapshotEnvVars,
  resolveConfigEnvVars,
  loadTranslatorConfig,
  resolveAndValidateEngineConfig,
  logConfiguredEnginePlan,
  MissingEnvironmentValueError,
  InvalidTranslatorConfigError
} from '../../../src/core/config/configLoader'
import { IEnvVars } from '../../../src/core/config/envVarsSchema'
import { Logger } from '../../../src/core/util/baseLogger'
import type { ITranslatorConfig } from '../../../src/core/config'
import { GEMINI_DEFAULT_ENDPOINT, GEMINI_DEFAULT_MODEL } from '../../../src/translators/gemini'
import { UntrustedEndpointError } from '../../../src/core/util/endpointValidator'
import type { EngineConfig } from '../../../src/translators/types'

// Minimal logger for tests
function createTestLogger(): Logger & { messages: string[] } {
  const messages: string[] = []
  return {
    messages,
    info: (msg: string) => messages.push(`[info] ${msg}`),
    warn: (msg: string) => messages.push(`[warn] ${msg}`),
    error: (msg: string) => messages.push(`[error] ${msg}`),
    debug: (msg: string) => messages.push(`[debug] ${msg}`),
    appendLine: () => {},
    show: () => {}
  }
}

/**
 * Mask apiKey values in a translator config object, showing only the first 4 characters
 * followed by asterisks (e.g., "abcd****" for a 12-char key).
 * Useful for displaying config in test output without exposing full credentials.
 */
function maskConfigApiKeys(config: ITranslatorConfig): ITranslatorConfig {
  const maskKey = (val: unknown): unknown => {
    if (typeof val === 'string' && val.length > 0) {
      return val.length <= 4 ? val : val.slice(0, 4) + '****'
    }
    return val
  }

  if (!config.translator) return config

  const maskedTranslator: Record<string, unknown> = { ...config.translator }
  for (const [engine, engineConfig] of Object.entries(config.translator)) {
    if (engineConfig && typeof engineConfig === 'object') {
      maskedTranslator[engine] = {
        ...engineConfig,
        ...(('apiKey' in engineConfig) && { apiKey: maskKey(engineConfig.apiKey) })
      }
    }
  }

  return { ...config, translator: maskedTranslator as ITranslatorConfig['translator'] }
}

/**
 * Log the final ITranslatorConfig with masked apiKey values.
 * Useful for debugging test output while keeping credentials hidden.
 * Displays to both logger and console for visibility in test output.
 */
function displayLoadedConfig(config: ITranslatorConfig, logger: Logger): void {
  const masked = maskConfigApiKeys(config)
  const configStr = JSON.stringify(masked, null, 2)
  logger.info(`Loaded ITranslatorConfig: ${configStr}`)
  console.log(`[test] Final masked ITranslatorConfig:\n${configStr}`)
}

// ---------------------------------------------------------------------------
// snapshotEnvVars
// ---------------------------------------------------------------------------
describe('snapshotEnvVars', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('captures known env vars from process.env', () => {
    process.env.AZURE_TRANSLATION_KEY = 'az-key'
    process.env.GOOGLE_TRANSLATION_KEY = 'goog-key'

    const vars = snapshotEnvVars()
    expect(vars.AZURE_TRANSLATION_KEY).toBe('az-key')
    expect(vars.GOOGLE_TRANSLATION_KEY).toBe('goog-key')
  })

  it('returns undefined for unset vars', () => {
    delete process.env.DEEPL_TRANSLATION_KEY
    const vars = snapshotEnvVars()
    expect(vars.DEEPL_TRANSLATION_KEY).toBeUndefined()
  })

  it('ignores unknown keys from process.env', () => {
    process.env.RANDOM_UNRELATED_VAR = 'hello'
    const vars = snapshotEnvVars()
    expect((vars as Record<string, unknown>)['RANDOM_UNRELATED_VAR']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// loadEnvVars
// ---------------------------------------------------------------------------
describe('loadEnvVars', () => {
  let tmpDir: string
  const savedEnv = { ...process.env }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-test-'))
    // Clear relevant env vars
    delete process.env.AZURE_TRANSLATION_KEY
    delete process.env.GOOGLE_TRANSLATION_KEY
    delete process.env.I18N_TRANSLATOR_ENV_DIR
  })

  afterEach(() => {
    process.env = { ...savedEnv }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads env vars from translator.env into process.env', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.env'),
      "AZURE_TRANSLATION_KEY='test-az-key'\nGOOGLE_TRANSLATION_KEY='test-g-key'\n"
    )

    const logger = createTestLogger()
    const vars = loadEnvVars(tmpDir, logger)

    expect(process.env.AZURE_TRANSLATION_KEY).toBe('test-az-key')
    expect(vars.AZURE_TRANSLATION_KEY).toBe('test-az-key')
    expect(vars.GOOGLE_TRANSLATION_KEY).toBe('test-g-key')
    expect(process.env.I18N_TRANSLATOR_ENV_DIR).toBe(tmpDir)
  })

  it('returns snapshot even when translator.env does not exist', () => {
    process.env.AZURE_TRANSLATION_KEY = 'from-process'

    const logger = createTestLogger()
    const vars = loadEnvVars(tmpDir, logger)

    expect(vars.AZURE_TRANSLATION_KEY).toBe('from-process')
    expect(logger.messages.some((m) => m.includes('not found'))).toBe(true)
  })

  it('logs warning when env file is missing', () => {
    const logger = createTestLogger()
    loadEnvVars(tmpDir, logger)
    expect(logger.messages.some((m) => m.includes('not found'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveConfigEnvVars
// ---------------------------------------------------------------------------
describe('resolveConfigEnvVars', () => {
  const logger = createTestLogger()
  const envVars: IEnvVars = {
    AZURE_TRANSLATION_KEY: 'resolved-az-key',
    AZURE_TRANSLATION_REGION: 'eastus',
    AZURE_TRANSLATION_URL: 'https://api.cognitive.microsofttranslator.com',
    GOOGLE_TRANSLATION_KEY: '/path/to/creds.json',
    GOOGLE_TRANSLATION_URL: 'https://translation.googleapis.com',
    GOOGLE_TRANSLATION_PROJECT_ID: 'my-project',
    GOOGLE_TRANSLATION_LOCATION: 'global'
  }

  it('replaces ${VAR} in strings', () => {
    const result = resolveConfigEnvVars(
      '${AZURE_TRANSLATION_KEY}',
      envVars,
      logger
    )
    expect(result).toBe('resolved-az-key')
  })

  it('replaces multiple ${VAR} in one string', () => {
    const result = resolveConfigEnvVars(
      '${AZURE_TRANSLATION_URL}/translate?region=${AZURE_TRANSLATION_REGION}',
      envVars,
      logger
    )
    expect(result).toBe(
      'https://api.cognitive.microsofttranslator.com/translate?region=eastus'
    )
  })

  it('replaces env:VAR_NAME whole-string reference', () => {
    const result = resolveConfigEnvVars('env:AZURE_TRANSLATION_KEY', envVars, logger)
    expect(result).toBe('resolved-az-key')
  })

  it('resolves nested objects recursively', () => {
    const input = {
      translator: {
        azure: {
          apiKey: '${AZURE_TRANSLATION_KEY}',
          region: '${AZURE_TRANSLATION_REGION}',
          langMap: { 'zh-CN': 'zh-Hans' }
        }
      }
    }
    const result = resolveConfigEnvVars(input, envVars, logger) as any
    expect(result.translator.azure.apiKey).toBe('resolved-az-key')
    expect(result.translator.azure.region).toBe('eastus')
    // Non-env strings untouched
    expect(result.translator.azure.langMap['zh-CN']).toBe('zh-Hans')
  })

  it('resolves arrays', () => {
    const input = ['${AZURE_TRANSLATION_KEY}', 'literal', '${GOOGLE_TRANSLATION_URL}']
    const result = resolveConfigEnvVars(input, envVars, logger) as string[]
    expect(result).toEqual(['resolved-az-key', 'literal', 'https://translation.googleapis.com'])
  })

  it('passes through non-string primitives', () => {
    expect(resolveConfigEnvVars(42, envVars, logger)).toBe(42)
    expect(resolveConfigEnvVars(true, envVars, logger)).toBe(true)
    expect(resolveConfigEnvVars(null, envVars, logger)).toBeNull()
  })

  it('throws for unknown vars', () => {
    expect(() => resolveConfigEnvVars('${UNKNOWN_VAR}', envVars, logger)).toThrow(MissingEnvironmentValueError)
  })
})

// ---------------------------------------------------------------------------
// loadTranslatorConfig — end-to-end
// ---------------------------------------------------------------------------
describe('loadTranslatorConfig', () => {
  let tmpDir: string
  const savedEnv = { ...process.env }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-e2e-'))
    // Clear all translator env vars so tests are isolated
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith('AZURE_TRANSLATION') ||
        key.startsWith('GOOGLE_TRANSLATION') ||
        key.startsWith('DEEPL_TRANSLATION') ||
        key.startsWith('GEMINI_API') ||
        key.startsWith('OPENROUTER_API') ||
        key === 'I18N_TRANSLATOR_ENV_DIR'
      ) {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.env = { ...savedEnv }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no files exist', () => {
    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)

    expect(config.sourceLocale).toBe('en')
    expect(config.defaultMarkdownEngine).toBe('azure')
    expect(config.defaultJsonEngine).toBe('google')
    expect(config.translator).toBeUndefined()
  })

  it('loads translator.json but defers translator engine env var resolution', () => {
    // Write env file
    fs.writeFileSync(
      path.join(tmpDir, 'translator.env'),
      "AZURE_TRANSLATION_KEY='my-secret-key'\nAZURE_TRANSLATION_REGION='westus2'\n"
    )

    // Write config file
    const configJson = JSON.stringify({
      sourceLocale: 'fr',
      targetLocales: ['en', 'de'],
      translator: {
        copy: {},
        azure: {
          apiKey: '${AZURE_TRANSLATION_KEY}',
          region: '${AZURE_TRANSLATION_REGION}'
        }
      }
    })
    fs.writeFileSync(path.join(tmpDir, 'translator.json'), configJson)

    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)

    expect(config.sourceLocale).toBe('fr')
    expect(config.targetLocales).toEqual(['en', 'de'])
    // Engine env placeholders are intentionally unresolved at config-load time
    expect(config.translator?.azure?.apiKey).toBe('${AZURE_TRANSLATION_KEY}')
    expect(config.translator?.azure?.region).toBe('${AZURE_TRANSLATION_REGION}')
    // Defaults applied by Zod
    expect(config.translator?.azure?.endpoint).toBe(
      'https://api.cognitive.microsofttranslator.com'
    )
    expect(config.translator?.azure?.timeoutMs).toBe(30_000)

    // Display final config with masked apiKey values for debugging
    displayLoadedConfig(config, logger)
  })

  it('throws validation errors for invalid config', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        defaultMarkdownEngine: 'nonexistent-engine'
      })
    )

    const logger = createTestLogger()
    expect(() => loadTranslatorConfig(tmpDir, logger)).toThrow(InvalidTranslatorConfigError)
  })

  it('does not throw when translator.json references missing engine env vars', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        translator: {
          copy: {},
          azure: {
            apiKey: '${AZURE_TRANSLATION_KEY}'
          }
        }
      })
    )

    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)
    expect(config.translator?.azure?.apiKey).toBe('${AZURE_TRANSLATION_KEY}')
  })

  it('applies engine defaults for partially-configured engines', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        translator: {
          copy: {},
          gemini: { apiKey: 'gem-key' }
        }
      })
    )

    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)

    expect(config.translator?.gemini?.apiKey).toBe('gem-key')
    expect(config.translator?.gemini?.model).toBe(GEMINI_DEFAULT_MODEL)
    expect(config.translator?.gemini?.temperature).toBe(0.1)
    expect(config.translator?.gemini?.maxOutputTokens).toBe(1024)
    expect(config.translator?.gemini?.timeoutMs).toBe(60_000)
  })

  it('preserves langMap entries through env resolution', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        translator: {
          copy: {},
          azure: {
            apiKey: 'key',
            langMap: { 'zh-CN': 'zh-Hans', 'pt-BR': 'pt-BR' }
          }
        }
      })
    )

    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)

    expect(config.translator?.azure?.langMap).toEqual({
      'zh-CN': 'zh-Hans',
      'pt-BR': 'pt-BR'
    })
  })

  it('handles JSON5 comments in translator.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      `{
        // This is a comment
        "sourceLocale": "es",
        "targetLocales": ["en"]
      }`
    )

    const logger = createTestLogger()
    const config = loadTranslatorConfig(tmpDir, logger)

    expect(config.sourceLocale).toBe('es')
  })

  it('logs engine plan for forward and back translation pairs', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        sourceLocale: 'en',
        targetLocales: ['fr'],
        enableBackTranslation: true,
        defaultMarkdownEngine: 'azure',
        defaultJsonEngine: 'google',
        engineOverrides: {
          deepl: ['en:fr']
        }
      })
    )

    const logger = createTestLogger()
    loadTranslatorConfig(tmpDir, logger)

    const infoMessages = logger.messages.filter((m) => m.startsWith('[info] Engine plan'))
    expect(infoMessages.some((m) => m.includes('[forward] en -> fr'))).toBe(true)
    expect(infoMessages.some((m) => m.includes('[back] fr -> en'))).toBe(true)
  })
})

describe('resolveAndValidateEngineConfig', () => {
  const logger = createTestLogger()

  it('resolves env placeholders lazily for an engine at runtime', () => {
    const envVars: IEnvVars = {
      AZURE_TRANSLATION_KEY: 'runtime-az-key',
      AZURE_TRANSLATION_REGION: 'eastus'
    }

    const resolved = resolveAndValidateEngineConfig(
      'azure',
      {
        apiKey: '${AZURE_TRANSLATION_KEY}',
        region: '${AZURE_TRANSLATION_REGION}'
      } as EngineConfig,
      envVars,
      logger
    )

    expect((resolved as Record<string, unknown>)['apiKey']).toBe('runtime-az-key')
    expect((resolved as Record<string, unknown>)['region']).toBe('eastus')
    expect((resolved as Record<string, unknown>)['endpoint']).toBe(
      'https://api.cognitive.microsofttranslator.com'
    )
  })

  it('throws MissingEnvironmentValueError when a used engine env var is missing', () => {
    const missingVarName = 'I18N_TRANSLATOR_TEST_MISSING_VAR'
    delete process.env[missingVarName]
    const envVars: IEnvVars = {}

    expect(() =>
      resolveAndValidateEngineConfig(
        'azure',
        {
          apiKey: `\${${missingVarName}}`,
          region: 'westus'
        } as EngineConfig,
        envVars,
        logger
      )
    ).toThrow(MissingEnvironmentValueError)
  })

  it('throws UntrustedEndpointError for untrusted runtime engine endpoint', () => {
    const envVars: IEnvVars = {
      AZURE_TRANSLATION_KEY: 'runtime-az-key'
    }

    expect(() =>
      resolveAndValidateEngineConfig(
        'azure',
        {
          apiKey: '${AZURE_TRANSLATION_KEY}',
          region: 'westus',
          endpoint: 'https://evil.example.com'
        } as EngineConfig,
        envVars,
        logger
      )
    ).toThrow(UntrustedEndpointError)
  })
})

// ---------------------------------------------------------------------------
// Fixture-based display test — mirrors the real app/integration load procedure
// ---------------------------------------------------------------------------
describe('loadTranslatorConfig - fixture load display', () => {
  it('loads and displays masked config exactly as app/integration fixtures do', () => {
    const fixtureDir = path.join(process.cwd(), 'test-project')
    const fixtureJsonPath = path.join(fixtureDir, 'translator.json')

    expect(fs.existsSync(fixtureJsonPath)).toBe(true)

    const logger = createTestLogger()

    // Real app procedure, no manual env setup:
    //   1. loadEnvVars reads translator.env (if present) into process.env
    //   2. translator.json ${VAR} placeholders are resolved from process.env
    //   3. Zod parsing applies defaults to any missing fields — the ONLY place defaults come from
    const config = loadTranslatorConfig(fixtureDir, logger)

    const rawFixture = JSON5.parse(fs.readFileSync(fixtureJsonPath, 'utf8')) as {
      translator?: Record<string, unknown>
    }
    const expectedTranslatorKeys = Object.keys(rawFixture.translator ?? {}).sort()
    const actualTranslatorKeys = Object.keys(config.translator ?? {}).sort()
    expect(actualTranslatorKeys).toEqual(expectedTranslatorKeys)

    // Transform ITranslatorConfig → masked ITranslatorConfig → output
    displayLoadedConfig(config, logger)
  })
})

describe('logConfiguredEnginePlan', () => {
  it('logs message when no target locales are configured', () => {
    const logger = createTestLogger()

    logConfiguredEnginePlan(
      {
        rootDir: '.',
        sourcePaths: ['i18n/en'],
        sourceLocale: 'en',
        targetLocales: [],
        enableBackTranslation: false,
        defaultMarkdownEngine: 'azure',
        defaultJsonEngine: 'google',
        engineOverrides: {},
        excludeKeys: [],
        excludeKeyPaths: [],
        copyOnlyFiles: [],
        csvExportPath: 'translator.csv',
        autoExport: true,
        autoImport: false,
        translator: undefined
      },
      logger
    )

    expect(logger.messages.some((m) => m.includes('no target locales configured'))).toBe(true)
  })
})
