import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterTranslator, OPENROUTER_DEFAULT_MODEL, OPENROUTER_DEFAULT_ENDPOINT } from '../../../src/translators/openrouter';
import { requireEnv } from './testEnv';

const openRouterKey = requireEnv('OPENROUTER_API_KEY');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('integration: openrouter translator', () => {
  it('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await OpenRouterTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      rootDir: process.cwd(),
      apiConfig: {
        apiKey: openRouterKey,
        endpoint: process.env.OPENROUTER_API_URL || OPENROUTER_DEFAULT_ENDPOINT,
        model: OPENROUTER_DEFAULT_MODEL,
        langMap: {
          en: 'English',
          es: 'Spanish'
        },
        temperature: 0,
        maxOutputTokens: 256,
        timeoutMs: 60000
      }
    });

    const loggedErrors = consoleErrorSpy.mock.calls
      .map((args) => args.map((value) => String(value)).join(' '))
      .join('\n');

    if (loggedErrors.length > 0) {
      throw new Error(`OpenRouter integration failure: ${loggedErrors}`);
    }

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 100000);
});
