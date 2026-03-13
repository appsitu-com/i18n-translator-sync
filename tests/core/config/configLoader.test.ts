import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  loadEnvVars,
  snapshotEnvVars,
  resolveConfigEnvVars,
  loadTranslatorConfig,
  MissingEnvironmentValueError
} from '../../../src/core/config/configLoader'
import { IEnvVars } from '../../../src/core/config/envVarsSchema'
import { Logger } from '../../../src/core/util/baseLogger'

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
    const { config, errors } = loadTranslatorConfig(tmpDir, logger)

    expect(errors).toEqual([])
    expect(config.sourceLocale).toBe('en')
    expect(config.defaultMarkdownEngine).toBe('azure')
    expect(config.defaultJsonEngine).toBe('google')
    expect(config.translator).toBeUndefined()
  })

  it('loads translator.json and resolves env vars from translator.env', () => {
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
    const { config, errors } = loadTranslatorConfig(tmpDir, logger)

    expect(errors).toEqual([])
    expect(config.sourceLocale).toBe('fr')
    expect(config.targetLocales).toEqual(['en', 'de'])
    expect(config.translator?.azure?.apiKey).toBe('my-secret-key')
    expect(config.translator?.azure?.region).toBe('westus2')
    // Defaults applied by Zod
    expect(config.translator?.azure?.endpoint).toBe(
      'https://api.cognitive.microsofttranslator.com'
    )
    expect(config.translator?.azure?.timeoutMs).toBe(30_000)
  })

  it('merges env file on top of process.env', () => {
    // Set one var in process.env
    process.env.GOOGLE_TRANSLATION_KEY = '/existing/creds.json'

    // translator.env overrides another var
    fs.writeFileSync(
      path.join(tmpDir, 'translator.env'),
      "GOOGLE_TRANSLATION_PROJECT_ID='proj-from-env'\n"
    )

    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        translator: {
          copy: {},
          google: {
            apiKey: '${GOOGLE_TRANSLATION_KEY}',
            googleProjectId: '${GOOGLE_TRANSLATION_PROJECT_ID}'
          }
        }
      })
    )

    const logger = createTestLogger()
    const { config } = loadTranslatorConfig(tmpDir, logger)

    expect(config.translator?.google?.apiKey).toBe('/existing/creds.json')
    expect(config.translator?.google?.googleProjectId).toBe('proj-from-env')
  })

  it('reports validation errors for invalid config', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'translator.json'),
      JSON.stringify({
        defaultMarkdownEngine: 'nonexistent-engine'
      })
    )

    const logger = createTestLogger()
    const { errors } = loadTranslatorConfig(tmpDir, logger)

    expect(errors.length).toBeGreaterThan(0)
  })

  it('throws when translator.json references a missing env var', () => {
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
    expect(() => loadTranslatorConfig(tmpDir, logger)).toThrow(MissingEnvironmentValueError)
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
    const { config } = loadTranslatorConfig(tmpDir, logger)

    expect(config.translator?.gemini?.apiKey).toBe('gem-key')
    expect(config.translator?.gemini?.geminiModel).toBe('gemini-pro')
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
    const { config } = loadTranslatorConfig(tmpDir, logger)

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
    const { config, errors } = loadTranslatorConfig(tmpDir, logger)

    expect(errors).toEqual([])
    expect(config.sourceLocale).toBe('es')
  })
})
