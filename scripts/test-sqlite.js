#!/usr/bin/env node

// Test if better-sqlite3 bindings are loaded correctly
try {
  const sqlite3 = require('better-sqlite3');
  console.log('Successfully loaded better-sqlite3');

  // Try to open an in-memory database
  const db = sqlite3(':memory:');
  console.log('Successfully opened in-memory database');

  // Try a simple query
  const version = db.pragma('user_version', { simple: true });
  console.log(`SQLite user_version: ${version}`);

  // Close the database
  db.close();
  console.log('Database closed successfully');
} catch (error) {
  console.error('Failed to load better-sqlite3:', error);
  console.error('Stack trace:', error.stack);

  // Check if this is a binding load error
  if (error.message && error.message.includes('find the module')) {
    console.error('\nThis looks like a binding loading error. The module was not found.');
    console.error('Try rebuilding the module for your environment:');
    console.error('  - For Node.js: pnpm rebuild:sqlite');
    console.error('  - For Electron/VS Code: pnpm rebuild:sqlite:electron');
  }

  process.exit(1);
}