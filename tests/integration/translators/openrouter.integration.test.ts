import { describe, expect, it } from 'vitest';
import { OpenRouterTranslator } from '../../../src/translators/openrouter';

const openRouterKey = process.env.OPENROUTER_API_KEY;
const runLiveTranslatorTests = process.env.RUN_LIVE_TRANSLATOR_TESTS === '1';
const hasOpenRouterConfig = Boolean(runLiveTranslatorTests && openRouterKey);
const itIfOpenRouterConfigured = hasOpenRouterConfig ? it : it.skip;

describe('integration: openrouter translator', () => {
  itIfOpenRouterConfigured('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await OpenRouterTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: openRouterKey as string,
        endpoint: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
        openrouterModel: 'anthropic/claude-3-haiku',
        temperature: 0,
        maxOutputTokens: 256
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 100000);
});
