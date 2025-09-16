#!/usr/bin/env node

// Script to determine the Electron version that VS Code is using
const { execSync } = require('child_process');

try {
  // Check for VS Code's own documentation of its Electron version
  const result = execSync('code --version').toString().trim();
  console.log('VS Code version:', result.split('\n')[0]);

  // Try getting the Electron version from VS Code
  const electronVersion = execSync('code --status').toString().match(/Electron:\s+(\d+\.\d+\.\d+)/);
  if (electronVersion && electronVersion[1]) {
    console.log('Electron version:', electronVersion[1]);
  } else {
    console.log('Could not determine Electron version automatically');
  }
} catch (error) {
  console.error('Error finding Electron version:', error.message);
}