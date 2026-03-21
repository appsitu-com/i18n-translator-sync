import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { GoogleTranslator, clearTokenCache, GOOGLE_DEFAULT_ENDPOINT } from '../../../src/translators/google';
import { requireEnv } from './testEnv';

// Can be either inline JSON string or file path to credentials JSON
const googleCredentials = requireEnv('GOOGLE_TRANSLATION_KEY');
const googleProjectId = requireEnv('GOOGLE_TRANSLATION_PROJECT_ID');

/** Credentials in translator.env are relative to the test-project folder. */
const testProjectDir = resolve(process.cwd(), 'test-project');

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
        apiKey: googleCredentials,
        endpoint: process.env.GOOGLE_TRANSLATION_URL || GOOGLE_DEFAULT_ENDPOINT,
        googleProjectId,
        googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global',
        timeoutMs: 60000,
        langMap: {}
      },
      rootDir: testProjectDir
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeTypeOf('string');
    expect(result[0].trim().length).toBeGreaterThan(0);
    expect(result[0]).not.toEqual(sourceText);
  }, 70000);

  it('creates OAuth token with real credentials and reuses it from in-memory cache', async () => {
    // Clear any cached tokens from previous tests
    clearTokenCache();

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const opts = {
        sourceLocale: 'en',
        targetLocale: 'es',
        apiConfig: {
          apiKey: googleCredentials,
          endpoint: process.env.GOOGLE_TRANSLATION_URL || GOOGLE_DEFAULT_ENDPOINT,
          googleProjectId,
          googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global',
          timeoutMs: 60000,
          langMap: {}
        },
        rootDir: testProjectDir
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
