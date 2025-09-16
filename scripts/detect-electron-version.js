#!/usr/bin/env node

// Attempt to detect VS Code's Electron version using various methods

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log(`Detecting VS Code's Electron version...`);
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${os.platform()} (${os.arch()})`);
console.log('');

// Method 1: Try to find electron in VS Code's resources directory
function findElectronVersionInVSCode() {
  try {
    let vscodePath;

    // Try to determine VS Code installation path based on OS
    if (os.platform() === 'win32') {
      // On Windows, check common installation locations
      const possiblePaths = [
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code'),
        'C:\\Program Files\\Microsoft VS Code',
        'C:\\Program Files (x86)\\Microsoft VS Code',
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          vscodePath = p;
          break;
        }
      }
    } else if (os.platform() === 'darwin') {
      // On macOS
      vscodePath = '/Applications/Visual Studio Code.app/Contents/Resources/app';
    } else {
      // On Linux
      vscodePath = '/usr/share/code';
    }

    if (!vscodePath) {
      console.log('❌ Could not determine VS Code installation path');
      return null;
    }

    console.log(`Found VS Code installation at: ${vscodePath}`);

    // Look for package.json in the resources/app directory
    let packageJsonPath;

    if (os.platform() === 'win32') {
      packageJsonPath = path.join(vscodePath, 'resources', 'app', 'package.json');
    } else if (os.platform() === 'darwin') {
      packageJsonPath = path.join(vscodePath, 'package.json');
    } else {
      packageJsonPath = path.join(vscodePath, 'resources', 'app', 'package.json');
    }

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.devDependencies && packageJson.devDependencies.electron) {
        console.log(`✅ Found Electron version in VS Code's package.json: ${packageJson.devDependencies.electron}`);
        return packageJson.devDependencies.electron;
      }
    }

    console.log('❌ Could not find Electron version in package.json');
    return null;
  } catch (error) {
    console.error('Error finding Electron in VS Code:', error.message);
    return null;
  }
}

// Method 2: Try to find electron in NODE_MODULES_VERSION environment variable
function findElectronVersionFromNodeModulesVersion() {
  try {
    // The module version corresponds to a specific Electron version
    // This is a guess based on documentation and might not be 100% accurate
    const electronNodeVersions = {
      // This is a simplified mapping and might need updates
      '108': '22.0.0',
      '106': '21.0.0',
      '103': '20.0.0',
      '101': '19.0.0',
      '89': '15.0.0',
      '87': '14.0.0',
      '83': '12.0.0',
      // Add more mappings as needed
    };

    // Try to create a better-sqlite3 binding error to see the expected node module version
    try {
      require('better-sqlite3');
    } catch (error) {
      const match = error.message.match(/NODE_MODULE_VERSION\s+(\d+)/i);
      if (match && match[1]) {
        const nodeModuleVersion = match[1];
        console.log(`Found NODE_MODULE_VERSION: ${nodeModuleVersion}`);

        if (electronNodeVersions[nodeModuleVersion]) {
          console.log(`✅ Mapped NODE_MODULE_VERSION to Electron version: ${electronNodeVersions[nodeModuleVersion]}`);
          return electronNodeVersions[nodeModuleVersion];
        } else {
          console.log(`❌ Could not map NODE_MODULE_VERSION ${nodeModuleVersion} to an Electron version`);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding Electron from NODE_MODULE_VERSION:', error.message);
    return null;
  }
}

// Method 3: Try to detect current Electron version from the binary
function detectElectronFromProcess() {
  try {
    if (process.versions && process.versions.electron) {
      console.log(`✅ Found Electron version from process.versions: ${process.versions.electron}`);
      return process.versions.electron;
    }
    console.log('❌ Not running in an Electron process');
    return null;
  } catch (error) {
    console.error('Error finding Electron from process:', error.message);
    return null;
  }
}

// Method 4: Check if VS Code's help menu includes electron version
function checkVSCodeAboutInfo() {
  try {
    console.log('Looking for VS Code version information...');

    let electronVersion = null;
    // This approach relies on VS Code's command line flags
    // which may vary between versions
    const result = spawnSync('code', ['--status'], {
      encoding: 'utf8',
      shell: true
    });

    if (result.stdout) {
      const match = result.stdout.match(/Electron:\s+(\d+\.\d+\.\d+)/i);
      if (match && match[1]) {
        console.log(`✅ Found Electron version from VS Code status: ${match[1]}`);
        electronVersion = match[1];
      }
    }

    if (!electronVersion) {
      console.log('❌ Could not determine Electron version from VS Code status');
    }

    return electronVersion;
  } catch (error) {
    console.error('Error checking VS Code about info:', error.message);
    return null;
  }
}

// Run all methods and collect results
const results = {
  fromVSCode: findElectronVersionInVSCode(),
  fromNodeModulesVersion: findElectronVersionFromNodeModulesVersion(),
  fromProcess: detectElectronFromProcess(),
  fromVSCodeAbout: checkVSCodeAboutInfo()
};

// Print summary
console.log('\n===== SUMMARY =====');
for (const [method, version] of Object.entries(results)) {
  console.log(`${method}: ${version || 'Not found'}`);
}

// Determine best version to use
let recommendedVersion = null;
for (const version of Object.values(results)) {
  if (version) {
    recommendedVersion = version;
    break;
  }
}

if (recommendedVersion) {
  console.log(`\n✅ RECOMMENDED ELECTRON VERSION: ${recommendedVersion}`);
  console.log('\nUpdate the VSCODE_ELECTRON_VERSION in scripts/rebuild-sqlite.js to:');
  console.log(`const VSCODE_ELECTRON_VERSION = '${recommendedVersion}'; // Update this as needed`);
} else {
  console.log('\n❌ Could not determine VS Code\'s Electron version.');
  console.log('You may need to check the VS Code GitHub repository or documentation.');
  console.log('Try checking: https://github.com/microsoft/vscode/');
}