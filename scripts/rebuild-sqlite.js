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

// Environment variable overrides for Visual Studio configuration
// Supports both npm naming and node-gyp naming conventions
const vsVersionOverride = process.env.npm_config_msvs_version || process.env.GYP_MSVS_VERSION;
const msbuildPathOverride = process.env.npm_config_msbuild_path || process.env.GYP_MSBUILD_PATH;

// Auto-detect Electron version from VS Code environment, fallback to hardcoded
// When running as preLaunchTask during debug, process.versions.electron is available
// When running during packaging (CI/CD), fallback to a safe default version
let VSCODE_ELECTRON_VERSION = '39.0.0'; // Fallback for packaging/CI (NODE_MODULE_VERSION 140)

// If running inside VS Code (during debug), use its Electron version
if (process.versions && process.versions.electron) {
  VSCODE_ELECTRON_VERSION = process.versions.electron;
}

/**
 * Detects installed Visual Studio versions and returns the most recent Build Tools installation
 * @returns {object|null} Object with version info or null if not found
 */
function detectVisualStudio() {
  const possiblePaths = [
    {
      name: 'Visual Studio 2026 Build Tools',
      version: '17.0',
      paths: [
        'C:\\Program Files\\Microsoft Visual Studio\\2026\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2026\\BuildTools',
        'C:\\Program Files\\Microsoft Visual Studio\\18\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools'
      ]
    },
    {
      name: 'Visual Studio 2022 Build Tools',
      version: '17.0',
      paths: [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
        'C:\\Program Files\\Microsoft Visual Studio\\17\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\17\\BuildTools'
      ]
    },
    {
      name: 'Visual Studio 2019 Build Tools',
      version: '16.0',
      paths: [
        'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools',
        'C:\\Program Files\\Microsoft Visual Studio\\16\\BuildTools',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\16\\BuildTools'
      ]
    }
  ];

  for (const installation of possiblePaths) {
    for (const basePath of installation.paths) {
      const msbuildPath = path.join(basePath, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe');
      if (fs.existsSync(msbuildPath)) {
        return {
          name: installation.name,
          version: installation.version,
          msbuildPath: msbuildPath,
          basePath: basePath
        };
      }
    }
  }
  return null;
}

console.log('🔧 SQLite3 Rebuilder');
console.log('=====================');
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${os.platform()} (${os.arch()})`);
console.log(`Electron version: ${VSCODE_ELECTRON_VERSION}${process.versions && process.versions.electron ? ' (auto-detected)' : ' (fallback)'}`);
if (vsVersionOverride) {
  console.log(`Visual Studio version override: ${vsVersionOverride}`);
}
if (msbuildPathOverride) {
  console.log(`MSBuild path override: ${msbuildPathOverride}`);
}
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

  // Detect or use Visual Studio configuration
  let vsConfig = { version: null, msbuildPath: null, vsDevCmdPath: null };

  if (vsVersionOverride && msbuildPathOverride) {
    console.log('✅ Using Visual Studio overrides from environment variables');
    vsConfig.version = vsVersionOverride;
    vsConfig.msbuildPath = msbuildPathOverride;
  } else {
    console.log('🔍 Detecting Visual Studio installation...');
    const detected = detectVisualStudio();
    if (detected) {
      console.log(`✅ Found: ${detected.name}`);
      console.log(`   Path: ${detected.basePath}`);
      vsConfig.msbuildPath = detected.msbuildPath;

      // Map VS version numbers to node-gyp compatible versions
      // VS 2026 (version 18) -> node-gyp 17.0 (2022/2019 compatible)
      // VS 2022 (version 17) -> node-gyp 17.0
      // VS 2019 (version 16) -> node-gyp 16.0
      const basePathVersion = detected.basePath.match(/\\(\d+)\\BuildTools/);
      let vsVersionNumber = basePathVersion ? basePathVersion[1] : '17';

      // node-gyp doesn't recognize version 18 yet, use 17.0 for VS 2026
      if (vsVersionNumber === '18') {
        console.log('ℹ️  VS 2026 detected, using node-gyp version 17.0 (compatible mode)');
        vsConfig.version = '17.0';
      } else {
        vsConfig.version = detected.version;
      }

      // Also check for VsDevCmd.bat which can set up the full environment
      const vsDevCmdPath = path.join(detected.basePath, 'Common7', 'Tools', 'VsDevCmd.bat');
      if (fs.existsSync(vsDevCmdPath)) {
        console.log(`✅ Found VsDevCmd.bat`);
        vsConfig.vsDevCmdPath = vsDevCmdPath;
      }
    } else {
      console.error('❌ No Visual Studio Build Tools detected!');
      console.error('Please install one of the following:');
      console.error('  - Visual Studio 2026 Build Tools');
      console.error('  - Visual Studio 2022 Build Tools');
      console.error('  - Visual Studio 2019 Build Tools');
      console.error('');
      console.error('Or set environment variables (PowerShell):');
      console.error('  $env:GYP_MSVS_VERSION = "17.0"');
      console.error('  $env:npm_config_msbuild_path = "C:\\path\\to\\MSBuild.exe"');
      console.error('  yarn rebuild:sqlite:electron');
      console.error('');
      console.error('Or in cmd.exe:');
      console.error('  set GYP_MSVS_VERSION=17.0');
      console.error('  set npm_config_msbuild_path=C:\\path\\to\\MSBuild.exe');
      console.error('  yarn rebuild:sqlite:electron');
      process.exit(1);
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

    // Set up environment with Visual Studio configuration
    const rebuildEnv = { ...process.env, DEBUG: 'electron-rebuild' };

    // node-gyp expects GYP_MSVS_VERSION for the Visual Studio version
    if (vsConfig.version) {
      rebuildEnv.GYP_MSVS_VERSION = vsConfig.version;
    }

    // Also set npm config variables for compatibility
    if (vsConfig.version) {
      rebuildEnv.npm_config_msvs_version = vsConfig.version;
    }
    if (vsConfig.msbuildPath) {
      rebuildEnv.npm_config_msbuild_path = vsConfig.msbuildPath;
    }

    if (verbose) {
      console.log(`Environment: GYP_MSVS_VERSION=${rebuildEnv.GYP_MSVS_VERSION}`);
      console.log(`Environment: npm_config_msvs_version=${rebuildEnv.npm_config_msvs_version}`);
      console.log(`Environment: npm_config_msbuild_path=${rebuildEnv.npm_config_msbuild_path}`);
    }

    let result;

    // Try using VsDevCmd.bat if available for better environment setup
    if (vsConfig.vsDevCmdPath && os.platform() === 'win32') {
      console.log('📝 Using VsDevCmd.bat to set up Visual Studio environment...');

      // Create a temporary batch file to run VsDevCmd and then electron-rebuild
      const tempBatchPath = path.join(__dirname, '..', '.vscode-rebuild-setup.bat');
      const batchContent = `@echo off
cd /d "${path.join(__dirname, '..')}"
call "${vsConfig.vsDevCmdPath}"
npx ${electronRebuildArgs.join(' ')}
`;

      fs.writeFileSync(tempBatchPath, batchContent);

      try {
        result = spawnSync('cmd', ['/c', tempBatchPath], {
          stdio: 'inherit',
          shell: true,
          cwd: path.join(__dirname, '..')
        });
      } finally {
        // Clean up temporary batch file
        try {
          fs.unlinkSync(tempBatchPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } else {
      // Fallback to direct npx call if VsDevCmd not available
      result = spawnSync('npx', electronRebuildArgs, {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(__dirname, '..'),
        env: rebuildEnv
      });
    }

    if (result.status !== 0) {
      console.error(`❌ electron-rebuild failed with exit code ${result.status}`);
      console.error('');
      console.error('Troubleshooting:');
      console.error('1. Verify Visual Studio Build Tools is installed with C++ workload:');
      console.error('   https://visualstudio.microsoft.com/downloads/');
      console.error('   Install "Desktop development with C++" workload');
      console.error('');
      console.error('2. Try setting environment variables manually (PowerShell):');
      console.error(`   $env:GYP_MSVS_VERSION = "${vsConfig.version || '17.0'}"`);
      console.error(`   $env:npm_config_msbuild_path = "${vsConfig.msbuildPath || 'C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe'}"`);
      console.error('   yarn rebuild:sqlite:electron');
      console.error('');
      console.error('   Or in cmd.exe:');
      console.error(`   set GYP_MSVS_VERSION=${vsConfig.version || '17.0'}`);
      console.error(`   set npm_config_msbuild_path=${vsConfig.msbuildPath || 'C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe'}`);
      console.error('   yarn rebuild:sqlite:electron');
      console.error('');
      console.error('3. For more debug info, run with:');
      console.error('   $env:DEBUG = "electron-rebuild"');
      console.error('   yarn rebuild:sqlite:electron --verbose');
      process.exit(result.status);
    }

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