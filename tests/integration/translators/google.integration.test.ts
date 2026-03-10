import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GoogleTranslator } from '../../../src/translators/google';
import { requireEnv } from './testEnv';

const googleCredentialPathRaw = requireEnv('GOOGLE_TRANSLATION_KEY');
const googleProjectId = requireEnv('GOOGLE_TRANSLATION_PROJECT_ID');
const googleCredentialPath = path.resolve(process.cwd(), googleCredentialPathRaw);

if (!existsSync(googleCredentialPath)) {
  throw new Error(`Google credentials file not found for integration tests: ${googleCredentialPath}`);
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('integration: google translator', () => {
  it('makes a real API call and returns translated text', async () => {
    const sourceText = 'Good morning, friend!';

    const result = await GoogleTranslator.translateMany([sourceText], [null], {
      sourceLocale: 'en',
      targetLocale: 'es',
      apiConfig: {
        key: googleCredentialPath,
        endpoint: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com',
        googleProjectId,
        googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global',
        timeoutMs: 60000
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);

  it('creates OAuth token with real credentials and reuses it from in-memory cache', async () => {
    const credentialsJson = readFileSync(googleCredentialPath, 'utf-8');

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const opts = {
        sourceLocale: 'en',
        targetLocale: 'es',
        apiConfig: {
          key: credentialsJson,
          endpoint: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com',
          googleProjectId,
          googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global',
          timeoutMs: 60000
        }
      };

      const first = await GoogleTranslator.translateMany(['Good morning'], [null], opts);
      const second = await GoogleTranslator.translateMany(['Good evening'], [null], opts);

      expect(first).toHaveLength(1);
      expect(first[0].trim().length).toBeGreaterThan(0);
      expect(second).toHaveLength(1);
      expect(second[0].trim().length).toBeGreaterThan(0);

      const calls = fetchSpy.mock.calls.map(([url]) => String(url));
      const tokenCalls = calls.filter((url) => url === TOKEN_URL);
      expect(tokenCalls).toHaveLength(1);

      const hasTranslateCall = calls.some((url) => url.includes(':translateText'));
      expect(hasTranslateCall).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 70000);
});
