import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GoogleTranslator } from '../../../src/translators/google';

const googleCredentialPathRaw = process.env.GOOGLE_TRANSLATION_KEY;
const googleProjectId = process.env.GOOGLE_TRANSLATION_PROJECT_ID;
const googleCredentialPath = googleCredentialPathRaw
  ? path.resolve(process.cwd(), googleCredentialPathRaw)
  : undefined;
const runLiveTranslatorTests = process.env.RUN_LIVE_TRANSLATOR_TESTS === '1';
const hasGoogleConfig = Boolean(
  runLiveTranslatorTests &&
  googleCredentialPath &&
    existsSync(googleCredentialPath) &&
    googleProjectId
);
const itIfGoogleConfigured = hasGoogleConfig ? it : it.skip;

describe('integration: google translator', () => {
  itIfGoogleConfigured('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await GoogleTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: googleCredentialPath as string,
        endpoint: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com',
        googleProjectId: googleProjectId as string,
        googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global',
        timeoutMs: 60000
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);
});
