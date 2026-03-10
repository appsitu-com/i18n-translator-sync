// test bootstrap
import { initTranslatorEnv } from '../src/core/util/environmentSetup';
import { nodeFileSystem } from '../src/core/util/fs';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Simple console logger for tests
const testLogger = {
  info: (msg: string) => console.log(`[test] ${msg}`),
  warn: (msg: string) => console.warn(`[test] ${msg}`),
  error: (msg: string) => console.error(`[test] ${msg}`),
  debug: (msg: string) => console.debug(`[test] ${msg}`),
  appendLine: (msg: string) => console.log(`[test] ${msg}`),
  show: () => {} // no-op for tests
};

// Load environment variables before running tests (once per process).
// Priority:
// 1) test-project/translator.env (matches manual extension testing in test-project workspace)
// 2) workspace translator.env (fallback)
const TEST_ENV_LOADED_FLAG = 'I18N_TRANSLATOR_TEST_ENV_LOADED';

if (process.env[TEST_ENV_LOADED_FLAG] !== '1') {
  const workspaceEnvFile = path.resolve(__dirname, '../translator.env');
  const testProjectEnvFile = path.resolve(__dirname, '../test-project/translator.env');
  const translatorEnvDirVar = 'I18N_TRANSLATOR_ENV_DIR';

  if (fs.existsSync(testProjectEnvFile)) {
    const result = dotenv.config({ path: testProjectEnvFile, override: true });
    process.env[translatorEnvDirVar] = path.dirname(testProjectEnvFile);
    if (result.error) {
      console.error('Error loading test-project/translator.env:', result.error);
    }
  } else if (fs.existsSync(workspaceEnvFile)) {
    const result = dotenv.config({ path: workspaceEnvFile, override: true });
    process.env[translatorEnvDirVar] = path.dirname(workspaceEnvFile);
    if (result.error) {
      console.error('Error loading translator.env:', result.error);
    }
  } else {
    // console.warn('No translator.env file found for tests, using fallback initialization');
    const rootDir = path.resolve(__dirname, '..');
    initTranslatorEnv(rootDir, testLogger, nodeFileSystem);
  }

  process.env[TEST_ENV_LOADED_FLAG] = '1';
}

// SQLite test environment setup - ensure it's available
const betterSqlitePath = path.resolve(__dirname, '../node_modules/better-sqlite3');

// Check if we need to rebuild SQLite
if (!fs.existsSync(betterSqlitePath) || !fs.existsSync(path.join(betterSqlitePath, 'build/Release'))) {
  console.warn('SQLite module may not be properly built for the current Node.js version.');
  console.warn('If tests fail with SQLite errors, run: pnpm rebuild:sqlite');
}