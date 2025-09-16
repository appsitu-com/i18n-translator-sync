// test bootstrap
import { initTranslatorEnv } from '../src/util/env';
import * as fs from 'fs';
import * as path from 'path';

// Initialize the environment from .translator.env before running tests
initTranslatorEnv();

// SQLite test environment setup - ensure it's available
const betterSqlitePath = path.resolve(__dirname, '../node_modules/better-sqlite3');

// Check if we need to rebuild SQLite
if (!fs.existsSync(betterSqlitePath) || !fs.existsSync(path.join(betterSqlitePath, 'build/Release'))) {
  console.warn('SQLite module may not be properly built for the current Node.js version.');
  console.warn('If tests fail with SQLite errors, run: yarn rebuild:sqlite');
}