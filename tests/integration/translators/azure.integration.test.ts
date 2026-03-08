import { describe, expect, it } from 'vitest';
import { AzureTranslator } from '../../../src/translators/azure';

const azureKey = process.env.AZURE_TRANSLATION_KEY;
const azureRegion = process.env.AZURE_TRANSLATION_REGION;
const runLiveTranslatorTests = process.env.RUN_LIVE_TRANSLATOR_TESTS === '1';
const hasAzureConfig = Boolean(runLiveTranslatorTests && azureKey && azureRegion);
const itIfAzureConfigured = hasAzureConfig ? it : it.skip;

describe('integration: azure translator', () => {
  itIfAzureConfigured('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await AzureTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: azureKey as string,
        region: azureRegion as string,
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
