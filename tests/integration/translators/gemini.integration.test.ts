import { describe, expect, it } from 'vitest';
import { GeminiTranslator, GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_ENDPOINT } from '../../../src/translators/gemini';
import { requireEnv } from './testEnv';

const geminiKey = requireEnv('GEMINI_API_KEY');

describe('integration: gemini translator', () => {
  const apiConfig = {
    apiKey: geminiKey,
    endpoint: process.env.GEMINI_API_URL || GEMINI_DEFAULT_ENDPOINT,
    model: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    temperature: 0,
    maxOutputTokens: 1024,
    timeoutMs: 90_000,
    langMap: {}
  };

  it('translates 5 strings with real API and returns 5 results', async () => {
    const sourceTexts = [
      'Good morning, friend!',
      'Please save your changes.',
      'Search results will appear here.',
      'Your session has expired.',
      'Settings updated successfully.'
    ];

    const result = await GeminiTranslator.translateMany(
      sourceTexts,
      new Array(sourceTexts.length).fill(null),
      { sourceLocale: 'en', targetLocale: 'es', rootDir: process.cwd(), apiConfig }
    );

    // One result per input string
    expect(result).toHaveLength(sourceTexts.length);

    for (const translated of result) {
      expect(translated).toBeTypeOf('string');
      expect(translated.trim().length).toBeGreaterThan(0);
      expect(translated).not.toEqual('');
    }
  }, 100_000);

  it('auto-discovers a Flash model when configured model is unavailable and translates multiple strings', async () => {
    const sourceTexts = [
      'Open the settings menu.',
      'Save all pending changes.',
      'This status is up to date.'
    ];

    const result = await GeminiTranslator.translateMany(
      sourceTexts,
      new Array(sourceTexts.length).fill(null),
      {
        sourceLocale: 'en',
        targetLocale: 'es',
        rootDir: process.cwd(),
        apiConfig: {
          ...apiConfig,
          model: 'gemini-model-that-does-not-exist'
        }
      }
    );

    expect(result).toHaveLength(sourceTexts.length);

    for (let i = 0; i < result.length; i += 1) {
      expect(result[i]).toBeTypeOf('string');
      expect(result[i].trim().length).toBeGreaterThan(0);
      expect(result[i]).not.toEqual(sourceTexts[i]);
    }
  }, 100_000);
});
