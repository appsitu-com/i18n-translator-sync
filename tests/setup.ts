// test bootstrap
import { initTranslatorEnv } from '../src/util/env';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables from test-project/.translator.env before running tests
const testProjectEnvFile = path.resolve(__dirname, '../test-project/.translator.env');
if (fs.existsSync(testProjectEnvFile)) {
  console.log('Loading environment variables from:', testProjectEnvFile);
  const result = dotenv.config({ path: testProjectEnvFile, override: true });
  if (result.error) {
    console.error('Error loading test-project/.translator.env:', result.error);
  } else {
    console.log('Successfully loaded API keys from test-project/.translator.env');
  }
} else {
  console.warn('test-project/.translator.env not found, using fallback initialization');
  // Initialize the environment from .translator.env in current directory as fallback
  initTranslatorEnv();
}

// SQLite test environment setup - ensure it's available
const betterSqlitePath = path.resolve(__dirname, '../node_modules/better-sqlite3');

// Check if we need to rebuild SQLite
if (!fs.existsSync(betterSqlitePath) || !fs.existsSync(path.join(betterSqlitePath, 'build/Release'))) {
  console.warn('SQLite module may not be properly built for the current Node.js version.');
  console.warn('If tests fail with SQLite errors, run: yarn rebuild:sqlite');
}