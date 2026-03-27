// cspell:ignore nllb
// Run this suite explicitly with: pnpm test:nllb
// Requires HUGGINGFACE_API_KEY and optionally HUGGINGFACE_API_URL in translator.env
import { describe, it, expect } from 'vitest';
import { NllbTranslator, NLLB_DEFAULT_MODEL, NLLB_DEFAULT_SEPARATOR, NLLB_DEFAULT_ENDPOINT } from '../../../src/translators/nllb';
import type { INllbConfig } from '../../../src/translators/nllb';
import { requireEnv } from './testEnv';

const huggingFaceKey = requireEnv('HUGGINGFACE_API_KEY');
const integrationModel = process.env.NLLB_MODEL || NLLB_DEFAULT_MODEL;

function createNllbConfig(maxOutputTokens: number): INllbConfig {
  return {
    apiKey: huggingFaceKey,
    endpoint: process.env.HUGGINGFACE_API_URL || NLLB_DEFAULT_ENDPOINT,
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

describe('integration: nllb translator', () => {
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
