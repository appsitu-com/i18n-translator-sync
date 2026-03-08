import { describe, expect, it } from 'vitest';
import { GeminiTranslator } from '../../../src/translators/gemini';

const geminiKey = process.env.GEMINI_API_KEY;
const runLiveTranslatorTests = process.env.RUN_LIVE_TRANSLATOR_TESTS === '1';
const hasGeminiConfig = Boolean(runLiveTranslatorTests && geminiKey);
const itIfGeminiConfigured = hasGeminiConfig ? it : it.skip;

describe('integration: gemini translator', () => {
  itIfGeminiConfigured('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await GeminiTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: geminiKey as string,
        endpoint: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
        geminiModel: 'gemini-1.5-pro',
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
