import { describe, expect, it } from 'vitest';
import { DeepLTranslator, DEEPL_DEFAULT_ENDPOINT_FREE } from '../../../src/translators/deepl';
import { requireEnv } from './testEnv';

const deeplKey = requireEnv('DEEPL_TRANSLATION_KEY');

describe('integration: deepl translator', () => {
  it('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await DeepLTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      rootDir: process.cwd(),
      apiConfig: {
        apiKey: deeplKey,
        endpoint: DEEPL_DEFAULT_ENDPOINT_FREE,
        timeoutMs: 60000,
        langMap: {}
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);
});
