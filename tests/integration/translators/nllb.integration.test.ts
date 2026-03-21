// cspell:ignore nllb
// NLLB model (meta-llama/nllb-200-1.3B) removed from OpenRouter — skipped until a replacement is available.
import { describe, it } from 'vitest';
import { NllbTranslator, NLLB_DEFAULT_MODEL, NLLB_DEFAULT_SEPARATOR, NLLB_DEFAULT_OPENROUTER_ENDPOINT } from '../../../src/translators/nllb';
import type { INllbConfig } from '../../../src/translators/nllb';
import { requireEnv } from './testEnv';

const openRouterKey = requireEnv('OPENROUTER_API_KEY');
const integrationModel = process.env.OPENROUTER_NLLB_MODEL || NLLB_DEFAULT_MODEL;

function createNllbConfig(maxOutputTokens: number): INllbConfig {
  return {
    apiKey: openRouterKey,
    endpoint: process.env.OPENROUTER_API_URL || NLLB_DEFAULT_OPENROUTER_ENDPOINT,
    model: integrationModel,
    separator: NLLB_DEFAULT_SEPARATOR,
    temperature: 0,
    maxOutputTokens,
    timeoutMs: 60000,
    retry: {
      maxRetries: 2,
      delayMs: 100,
      backoffFactor: 2
    },
    langMap: {}
  };
}

describe.skip('integration: nllb translator', () => {
  it('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await NllbTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: createNllbConfig(256),
      rootDir: '.'
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 100000);

  it('translates an array of 10 strings in one request', async () => {
    const sourceTexts = [
      'Good morning, friend!',
      'Please open the settings page.',
      'Save your changes before leaving.',
      'This dashboard shows the latest metrics.',
      'Search results will appear below.',
      'Your session has expired.',
      'Export the report as a CSV file.',
      'Notifications are enabled for this account.',
      'Update your profile information.',
      'Thank you for using this extension.'
    ];

    const result = await NllbTranslator.translateMany(sourceTexts, new Array(sourceTexts.length).fill(null), {
      sourceLocale: 'en',
      targetLocale: 'fr',
      apiConfig: createNllbConfig(1024),
      rootDir: '.'
    });

    console.log('NLLB batch output array:', result);

    expect(sourceTexts.length).toBe(10);
    expect(result.length).toBe(sourceTexts.length);
    expect(result).toHaveLength(sourceTexts.length);

    for (const translated of result) {
      expect(translated).toBeTypeOf('string');
      expect(translated.trim().length).toBeGreaterThan(0);
    }
  }, 100000);
});
