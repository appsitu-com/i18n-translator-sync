import { describe, expect, it } from 'vitest';
import { GeminiTranslator } from '../../../src/translators/gemini';
import { requireEnv } from './testEnv';

const geminiKey = requireEnv('GEMINI_API_KEY');

describe('integration: gemini translator', () => {
  it.skip('makes a real API call and returns translated text (currently failing - Gemini API model not found)', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await GeminiTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        apiKey: geminiKey,
        endpoint: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-pro',
        temperature: 0,
        maxOutputTokens: 256,
        timeoutMs: 90000
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 100000);
});
