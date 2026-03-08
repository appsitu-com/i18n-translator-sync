import { describe, expect, it } from 'vitest';
import { DeepLTranslator } from '../../../src/translators/deepl';

const deeplKey = process.env.DEEPL_TRANSLATION_KEY;
const runLiveTranslatorTests = process.env.RUN_LIVE_TRANSLATOR_TESTS === '1';
const hasDeepLConfig = Boolean(runLiveTranslatorTests && deeplKey);
const itIfDeepLConfigured = hasDeepLConfig ? it : it.skip;

describe('integration: deepl translator', () => {
  itIfDeepLConfigured('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await DeepLTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: deeplKey as string,
        endpoint: process.env.DEEPL_TRANSLATION_URL || 'https://api-free.deepl.com',
        free: true,
        timeoutMs: 60000
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);
});
