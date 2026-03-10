import { describe, expect, it } from 'vitest';
import { AzureTranslator } from '../../../src/translators/azure';
import { requireEnv } from './testEnv';

const azureKey = requireEnv('AZURE_TRANSLATION_KEY');
const azureRegion = requireEnv('AZURE_TRANSLATION_REGION');

describe('integration: azure translator', () => {
  it('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await AzureTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: azureKey,
        region: azureRegion,
        endpoint: process.env.AZURE_TRANSLATION_URL || 'https://api.cognitive.microsofttranslator.com',
        timeoutMs: 60000
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);
});
