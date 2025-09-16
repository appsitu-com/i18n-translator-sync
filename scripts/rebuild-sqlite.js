#!/usr/bin/env node

/**
 * Script to rebuild better-sqlite3 for the appropriate environment
 * This ensures the native module works with your current Node.js version
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
const skipClean = args.includes('--skip-clean');
const skipIfUnchanged = args.includes('--skip-if-unchanged');
const forceElectron = args.includes('--electron');
const verbose = args.includes('--verbose');

// VS Code's Electron version - update this when VS Code updates its Electron version
// https://github.com/microsoft/vscode/blob/main/.yarnrc
// Confirmed via detect-electron-version.js on 2024-08-14
const VSCODE_ELECTRON_VERSION = '37.3.1'; // VS Code 1.104.0

console.log('🔧 SQLite3 Rebuilder');
console.log('=====================');
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${os.platform()} (${os.arch()})`);

function runCommand(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });

  if (result.error) {
    console.error(`Error executing command: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status}`);
    process.exit(result.status);
  }

  return result;
}

function cleanModules() {
  console.log('📦 Cleaning better-sqlite3 module...');

  const betterSqlitePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
  const buildPath = path.join(betterSqlitePath, 'build');

  if (fs.existsSync(buildPath)) {
    try {
      if (os.platform() === 'win32') {
        runCommand('rmdir', ['/s', '/q', buildPath]);
      } else {
        runCommand('rm', ['-rf', buildPath]);
      }
      console.log('✅ Removed better-sqlite3 build directory');
    } catch (error) {
      console.warn('Warning: Could not remove better-sqlite3 build directory:', error.message);
    }
  }
}

function rebuildForNodeJS() {
  console.log('🧪 Rebuilding better-sqlite3 for current Node.js environment...');

  // For regular Node.js (testing environment)
  runCommand('npm', ['rebuild', 'better-sqlite3'], { cwd: path.join(__dirname, '..') });

  console.log('✅ Rebuilt better-sqlite3 for Node.js');
}

function rebuildForElectron() {
  console.log(`🚀 Rebuilding better-sqlite3 for Electron v${VSCODE_ELECTRON_VERSION}...`);

  // Check if we can skip rebuild
  if (skipIfUnchanged) {
    const versionFilePath = path.join(__dirname, '..', '.electron-version');

    // If version file exists and matches current version, we can skip
    if (fs.existsSync(versionFilePath)) {
      const savedVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
      if (savedVersion === VSCODE_ELECTRON_VERSION) {
        console.log(`ℹ️ Electron version unchanged (${VSCODE_ELECTRON_VERSION}), skipping rebuild`);
        return;
      }
    }
  }

  // Check if electron-rebuild is installed
  try {
    const electronRebuildPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-rebuild');
    const electronRebuildExists = fs.existsSync(electronRebuildPath) ||
                                 fs.existsSync(electronRebuildPath + '.cmd'); // Windows

    if (!electronRebuildExists) {
      console.log('⚠️ electron-rebuild not found in node_modules/.bin, installing...');
      runCommand('npm', ['install', '--no-save', 'electron-rebuild'], { cwd: path.join(__dirname, '..') });
    }
  } catch (err) {
    console.error('Error checking for electron-rebuild:', err);
  }

  // For VS Code's Electron version
  const electronRebuildArgs = [
    'electron-rebuild',
    '-f',
    '-w', 'better-sqlite3',
    '--version', VSCODE_ELECTRON_VERSION
  ];

  if (verbose) {
    electronRebuildArgs.push('--verbose');
  }

  try {
    console.log(`Running electron-rebuild with version ${VSCODE_ELECTRON_VERSION}...`);
    runCommand('npx', electronRebuildArgs, { cwd: path.join(__dirname, '..') });

    // Verify the build
    const betterSqlitePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
    if (fs.existsSync(betterSqlitePath)) {
      console.log('✅ Verified better-sqlite3 build directory exists');

      // List the files to ensure the binding file is there
      const files = fs.readdirSync(betterSqlitePath);
      console.log(`Found ${files.length} files in build directory: ${files.join(', ')}`);

      // Check specifically for the binding file
      const bindingFile = files.find(file => file.includes('.node'));
      if (bindingFile) {
        console.log(`✅ Found binding file: ${bindingFile}`);
      } else {
        console.error('❌ No binding file found in build directory!');
      }
    } else {
      console.error('❌ Build directory not found after rebuild!');
    }

    // Save current electron version to file for future reference
    const versionFilePath = path.join(__dirname, '..', '.electron-version');
    fs.writeFileSync(versionFilePath, VSCODE_ELECTRON_VERSION);

    console.log('✅ Rebuilt better-sqlite3 for Electron');
  } catch (err) {
    console.error('Error during electron-rebuild:', err);
    process.exit(1);
  }
}

// Main execution
console.log(`Command line arguments: ${args.join(' ')}`);

if (!skipClean) {
  cleanModules();
}

if (forceElectron) {
  // Display useful debugging information about the environment
  console.log('=== Environment Information ===');
  console.log(`Working directory: ${process.cwd()}`);

  // Check better-sqlite3 version
  const packageJsonPath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`better-sqlite3 version: ${packageJson.version}`);
  } else {
    console.log('better-sqlite3 package.json not found');
  }

  // Display NODE_MODULE_VERSION
  console.log(`Node.js NODE_MODULE_VERSION: ${process.versions.modules}`);
  console.log('=====================');

  rebuildForElectron();
} else {
  rebuildForNodeJS();
}

console.log('🎉 SQLite rebuild process completed!');