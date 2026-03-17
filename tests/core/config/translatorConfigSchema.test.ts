import { describe, it, expect } from 'vitest'
import {
  TranslatorConfigSchema,
  AzureConfigSchema,
  GoogleConfigSchema,
  DeepLConfigSchema,
  GeminiConfigSchema,
  OpenRouterConfigSchema,
  NllbConfigSchema,
  MyMemoryConfigSchema,
  TranslatorEngineSchema,
  TranslatorEnginesSchema
} from '../../../src/core/config/translatorConfigSchema'
import JSON5 from 'json5'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Engine name enum
// ---------------------------------------------------------------------------
describe('TranslatorEngineSchema', () => {
  it('accepts all valid engine names', () => {
    for (const name of ['azure', 'google', 'deepl', 'gemini', 'openrouter', 'nllb', 'mymemory', 'copy', 'auto']) {
      expect(TranslatorEngineSchema.safeParse(name).success).toBe(true)
    }
  })

  it('rejects unknown engine names', () => {
    expect(TranslatorEngineSchema.safeParse('chatgpt').success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Individual engine schemas – defaults
// ---------------------------------------------------------------------------
describe('AzureConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = AzureConfigSchema.parse({})
    expect(result.endpoint).toBe('https://api.cognitive.microsofttranslator.com')
    expect(result.timeoutMs).toBe(30_000)
    expect(result.langMap).toEqual({})
  })

  it('preserves user-supplied values', () => {
    const input = { apiKey: 'k', region: 'eastus', langMap: { 'zh-CN': 'zh-Hans' } }
    const result = AzureConfigSchema.parse(input)
    expect(result.apiKey).toBe('k')
    expect(result.region).toBe('eastus')
    expect(result.langMap).toEqual({ 'zh-CN': 'zh-Hans' })
  })
})

describe('GoogleConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = GoogleConfigSchema.parse({})
    expect(result.endpoint).toBe('https://translation.googleapis.com')
    expect(result.googleLocation).toBe('global')
    expect(result.timeoutMs).toBe(30_000)
    expect(result.langMap).toEqual({})
  })
})

describe('DeepLConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = DeepLConfigSchema.parse({})
    expect(result.endpoint).toBe('https://api-free.deepl.com')
    expect(result.free).toBe(false)
    expect(result.timeoutMs).toBe(30_000)
    expect(result.langMap).toEqual({})
  })
})

describe('GeminiConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = GeminiConfigSchema.parse({})
    expect(result.endpoint).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(result.geminiModel).toBe('gemini-pro')
    expect(result.temperature).toBe(0.1)
    expect(result.maxOutputTokens).toBe(1024)
    expect(result.timeoutMs).toBe(60_000)
    expect(result.langMap).toEqual({})
  })
})

describe('OpenRouterConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = OpenRouterConfigSchema.parse({})
    expect(result.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(result.openrouterModel).toBe('anthropic/claude-3-haiku')
    expect(result.temperature).toBe(0.1)
    expect(result.maxOutputTokens).toBe(2048)
    expect(result.timeoutMs).toBe(60_000)
    expect(result.langMap).toEqual({})
  })
})

describe('NllbConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = NllbConfigSchema.parse({})
    expect(result.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(result.nllbModel).toBe('meta-llama/nllb-200-1.3B')
    expect(result.temperature).toBe(0)
    expect(result.maxOutputTokens).toBe(4096)
    expect(result.separator).toBe('<<<SEP>>>')
    expect(result.timeoutMs).toBe(60_000)
    expect(result.langMap).toEqual({})
  })
})

describe('MyMemoryConfigSchema', () => {
  it('applies defaults for an empty object', () => {
    const result = MyMemoryConfigSchema.parse({})
    expect(result.endpoint).toBe('https://api.mymemory.translated.net/get')
    expect(result.timeoutMs).toBe(15_000)
    expect(result.langMap).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// TranslatorEnginesSchema
// ---------------------------------------------------------------------------
describe('TranslatorEnginesSchema', () => {
  it('parses an engines block with only a copy engine', () => {
    const result = TranslatorEnginesSchema.parse({ copy: {} })
    expect(result.copy).toEqual({})
    expect(result.azure).toBeUndefined()
    expect(result.google).toBeUndefined()
  })

  it('applies defaults for configured engines', () => {
    const result = TranslatorEnginesSchema.parse({
      copy: {},
      azure: { apiKey: 'abc' }
    })
    expect(result.azure?.apiKey).toBe('abc')
    expect(result.azure?.endpoint).toBe('https://api.cognitive.microsofttranslator.com')
    expect(result.azure?.timeoutMs).toBe(30_000)
  })
})

// ---------------------------------------------------------------------------
// Top-level TranslatorConfigSchema
// ---------------------------------------------------------------------------
describe('TranslatorConfigSchema', () => {
  it('applies all top-level defaults for a minimal config', () => {
    const result = TranslatorConfigSchema.parse({})
    expect(result.sourceDir).toBe('')
    expect(result.targetDir).toBe('')
    expect(result.sourcePaths).toEqual(['i18n/en'])
    expect(result.sourceLocale).toBe('en')
    expect(result.targetLocales).toEqual([])
    expect(result.enableBackTranslation).toBe(false)
    expect(result.defaultMarkdownEngine).toBe('azure')
    expect(result.defaultJsonEngine).toBe('google')
    expect(result.engineOverrides).toEqual({})
    expect(result.excludeKeys).toEqual([])
    expect(result.excludeKeyPaths).toEqual([])
    expect(result.copyOnlyFiles).toEqual([])
    expect(result.csvExportPath).toBe('translator.csv')
    expect(result.autoExport).toBe(true)
    expect(result.autoImport).toBe(false)
    expect(result.translator).toBeUndefined()
  })

  it('preserves user-supplied values', () => {
    const input = {
      sourceLocale: 'fr',
      targetLocales: ['en', 'de'],
      defaultMarkdownEngine: 'gemini',
      translator: {
        copy: {},
        gemini: { apiKey: 'gem-key', temperature: 0.5 }
      }
    }
    const result = TranslatorConfigSchema.parse(input)
    expect(result.sourceLocale).toBe('fr')
    expect(result.targetLocales).toEqual(['en', 'de'])
    expect(result.defaultMarkdownEngine).toBe('gemini')
    expect(result.translator?.gemini?.apiKey).toBe('gem-key')
    expect(result.translator?.gemini?.temperature).toBe(0.5)
    // defaults still applied to gemini fields not specified
    expect(result.translator?.gemini?.geminiModel).toBe('gemini-pro')
  })

  it('rejects an invalid defaultMarkdownEngine', () => {
    const result = TranslatorConfigSchema.safeParse({
      defaultMarkdownEngine: 'chatgpt'
    })
    expect(result.success).toBe(false)
  })

  it('rejects a negative timeoutMs on an engine', () => {
    const result = TranslatorConfigSchema.safeParse({
      translator: { copy: {}, azure: { timeoutMs: -1 } }
    })
    expect(result.success).toBe(false)
  })

  it('validates retry sub-schema', () => {
    const result = TranslatorConfigSchema.parse({
      translator: {
        copy: {},
        azure: { retry: { maxRetries: 5, delayMs: 200, backoffFactor: 3 } }
      }
    })
    expect(result.translator?.azure?.retry?.maxRetries).toBe(5)
    expect(result.translator?.azure?.retry?.delayMs).toBe(200)
    expect(result.translator?.azure?.retry?.backoffFactor).toBe(3)
  })

  it('parses the real translator.json from the repo root', () => {
    const configPath = path.resolve(__dirname, '../../../translator.json')
    if (!fs.existsSync(configPath)) return // skip if file doesn't exist in CI
    const raw = JSON5.parse(fs.readFileSync(configPath, 'utf8'))
    const result = TranslatorConfigSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.translator?.azure).toBeDefined()
      expect(result.data.translator?.google).toBeDefined()
      expect(result.data.translator?.deepl).toBeDefined()
    }
  })

  it('parses the sample translator.json', () => {
    const configPath = path.resolve(__dirname, '../../../samples/translator.json')
    if (!fs.existsSync(configPath)) return
    const raw = JSON5.parse(fs.readFileSync(configPath, 'utf8'))
    const result = TranslatorConfigSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })
})
