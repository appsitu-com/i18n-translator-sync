import { describe, it, expect } from 'vitest'
import {
  validateEndpoints,
  UntrustedEndpointError,
  ALLOWED_DOMAINS
} from '../../../src/core/util/endpointValidator'
import { ITranslatorConfig } from '../../../src/core/config/translatorConfigSchema'
import { AZURE_DEFAULT_ENDPOINT } from '../../../src/translators/azure'
import { GOOGLE_DEFAULT_ENDPOINT } from '../../../src/translators/google'
import { DEEPL_DEFAULT_ENDPOINT_FREE, DEEPL_DEFAULT_ENDPOINT } from '../../../src/translators/deepl'
import { GEMINI_DEFAULT_ENDPOINT } from '../../../src/translators/gemini'
import { OPENROUTER_DEFAULT_ENDPOINT } from '../../../src/translators/openrouter'
import { NLLB_DEFAULT_OPENROUTER_ENDPOINT } from '../../../src/translators/nllb'
import { MYMEMORY_DEFAULT_ENDPOINT } from '../../../src/translators/mymemory'

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T

describe('validateEndpoints', () => {
  it('does not throw when no translator engines are configured', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr']
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw when engines have no explicit endpoints', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        azure: {
          apiKey: 'test-key'
          // No endpoint - uses default
        },
        google: {
          apiKey: 'test-key'
          // No endpoint - uses default
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for Azure with trusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        azure: {
          apiKey: 'test-key',
          endpoint: AZURE_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws UntrustedEndpointError for Azure with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        azure: {
          apiKey: 'test-key',
          endpoint: 'https://malicious.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
    try {
      validateEndpoints(config as ITranslatorConfig)
      expect.fail('Should have thrown')
    } catch (error) {
      if (error instanceof UntrustedEndpointError) {
        expect(error.engineName).toBe('azure')
        expect(error.endpoint).toBe('https://malicious.example.com')
        expect(error.allowedDomains).toEqual(ALLOWED_DOMAINS.azure)
      } else {
        throw error
      }
    }
  })

  it('does not throw for Google with trusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      translator: {
        google: {
          apiKey: 'test-key',
          endpoint: GOOGLE_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for Google with wildcard subdomain', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      translator: {
        google: {
          apiKey: 'test-key',
          endpoint: 'https://custom-api.googleapis.com/v1'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws for Google with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      translator: {
        google: {
          apiKey: 'test-key',
          endpoint: 'https://fake-google.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
    try {
      validateEndpoints(config as ITranslatorConfig)
      expect.fail('Should have thrown')
    } catch (error) {
      if (error instanceof UntrustedEndpointError) {
        expect(error.engineName).toBe('google')
      } else {
        throw error
      }
    }
  })

  it('does not throw for DeepL with free endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['es'],
      translator: {
        deepl: {
          apiKey: 'test-key',
          endpoint: DEEPL_DEFAULT_ENDPOINT_FREE
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for DeepL with pro endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['es'],
      translator: {
        deepl: {
          apiKey: 'test-key',
          endpoint: DEEPL_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws for DeepL with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['es'],
      translator: {
        deepl: {
          apiKey: 'test-key',
          endpoint: 'https://fake-deepl.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
  })

  it('does not throw for Gemini with trusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['ja'],
      translator: {
        gemini: {
          apiKey: 'test-key',
          endpoint: GEMINI_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws for Gemini with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['ja'],
      translator: {
        gemini: {
          apiKey: 'test-key',
          endpoint: 'https://fake-gemini.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
  })

  it('does not throw for OpenRouter with trusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['pt'],
      translator: {
        openrouter: {
          apiKey: 'test-key',
          endpoint: OPENROUTER_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for OpenRouter with subdomain endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['pt'],
      translator: {
        openrouter: {
          apiKey: 'test-key',
          endpoint: 'https://api.openrouter.ai/v1/chat/completions'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws for OpenRouter with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['pt'],
      translator: {
        openrouter: {
          apiKey: 'test-key',
          endpoint: 'https://fake-openrouter.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
  })

  it('does not throw for NLLB with trusted OpenRouter endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        nllb: {
          apiKey: 'test-key',
          endpoint: NLLB_DEFAULT_OPENROUTER_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for MyMemory with trusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['zh'],
      translator: {
        mymemory: {
          endpoint: MYMEMORY_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws for MyMemory with untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['zh'],
      translator: {
        mymemory: {
          endpoint: 'https://fake-mymemory.example.com'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
  })

  it('does not throw for env var references in endpoints', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        azure: {
          apiKey: 'test-key',
          endpoint: '${AZURE_ENDPOINT_URL}'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('does not throw for env:VAR_NAME references in endpoints', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr'],
      translator: {
        google: {
          apiKey: 'test-key',
          endpoint: 'env:GOOGLE_ENDPOINT_URL'
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })

  it('throws correctly when multiple engines are configured but only one has untrusted endpoint', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr', 'de'],
      translator: {
        azure: {
          apiKey: 'test-key1',
          endpoint: AZURE_DEFAULT_ENDPOINT
        },
        google: {
          apiKey: 'test-key2',
          endpoint: 'https://fake-google.example.com'
        },
        deepl: {
          apiKey: 'test-key3',
          endpoint: DEEPL_DEFAULT_ENDPOINT_FREE
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).toThrow(
      UntrustedEndpointError
    )
    try {
      validateEndpoints(config as ITranslatorConfig)
      expect.fail('Should have thrown')
    } catch (error) {
      if (error instanceof UntrustedEndpointError) {
        expect(error.engineName).toBe('google')
      } else {
        throw error
      }
    }
  })

  it('validates all engines successfully when all are trusted', () => {
    const config: DeepPartial<ITranslatorConfig> = {
      sourceLocale: 'en',
      targetLocales: ['fr', 'de'],
      translator: {
        azure: {
          apiKey: 'key1',
          endpoint: AZURE_DEFAULT_ENDPOINT
        },
        google: {
          apiKey: 'key2',
          endpoint: GOOGLE_DEFAULT_ENDPOINT
        },
        deepl: {
          apiKey: 'key3',
          endpoint: DEEPL_DEFAULT_ENDPOINT_FREE
        },
        gemini: {
          apiKey: 'key4',
          endpoint: GEMINI_DEFAULT_ENDPOINT
        },
        openrouter: {
          apiKey: 'key5',
          endpoint: OPENROUTER_DEFAULT_ENDPOINT
        },
        mymemory: {
          endpoint: MYMEMORY_DEFAULT_ENDPOINT
        }
      }
    }

    expect(() => validateEndpoints(config as ITranslatorConfig)).not.toThrow()
  })
})
