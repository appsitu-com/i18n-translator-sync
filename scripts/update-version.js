/**
 * Version Update Helper
 *
 * This module helps with semantic versioning updates for the extension.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { promisify } = require('util');

// Constants
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Helper for creating command-line prompts
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Parse semantic version from a string like '1.2.3'
 * @param {string} versionStr - Version string to parse
 * @returns {object} - Object containing major, minor, and patch numbers
 */
function parseVersion(versionStr) {
  const parts = versionStr.split('.').map(part => parseInt(part, 10));
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

/**
 * Format version object back to string
 * @param {object} version - Version object with major, minor, patch properties
 * @returns {string} - Formatted version string
 */
function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Prompts user for version update type (major, minor, patch)
 * @returns {Promise<string>} - Selected version type
 */
async function promptVersionType() {
  const rl = createReadlineInterface();

  return new Promise((resolve) => {
    rl.question(
      'What kind of version update would you like?\n' +
      '1. major (x.0.0) - Breaking changes\n' +
      '2. minor (0.x.0) - New features, backwards compatible\n' +
      '3. patch (0.0.x) - Bug fixes, backwards compatible\n' +
      '4. custom - Enter a specific version\n' +
      'Enter option (1-4): ',
      (answer) => {
        rl.close();
        const option = parseInt(answer.trim(), 10);
        switch(option) {
          case 1: resolve('major'); break;
          case 2: resolve('minor'); break;
          case 3: resolve('patch'); break;
          case 4: resolve('custom'); break;
          default: resolve('patch'); // Default to patch for safety
        }
      }
    );
  });
}

/**
 * Prompts user for a custom version
 * @param {string} currentVersion - The current version
 * @returns {Promise<string>} - User entered version
 */
async function promptCustomVersion(currentVersion) {
  const rl = createReadlineInterface();

  return new Promise((resolve) => {
    rl.question(`Enter custom version (current: ${currentVersion}): `, (answer) => {
      rl.close();
      // Basic validation of semantic version format
      const versionRegex = /^\d+\.\d+\.\d+$/;
      if (versionRegex.test(answer.trim())) {
        resolve(answer.trim());
      } else {
        console.warn('Invalid version format. Using current version.');
        resolve(currentVersion);
      }
    });
  });
}

/**
 * Read current version from package.json
 * @returns {Promise<string>} - Current version string
 */
async function getCurrentVersion() {
  const data = await readFileAsync(PACKAGE_JSON_PATH, 'utf8');
  const packageJson = JSON.parse(data);
  return packageJson.version;
}

/**
 * Update version in package.json
 * @param {string} newVersion - New version string
 * @returns {Promise<void>}
 */
async function updatePackageJsonVersion(newVersion) {
  const data = await readFileAsync(PACKAGE_JSON_PATH, 'utf8');
  const packageJson = JSON.parse(data);
  packageJson.version = newVersion;
  await writeFileAsync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2), 'utf8');
}

/**
 * Calculate new version based on current version and update type
 * @param {string} currentVersion - Current version string
 * @param {string} updateType - Update type: 'major', 'minor', or 'patch'
 * @returns {string} - New version string
 */
function calculateNewVersion(currentVersion, updateType) {
  const version = parseVersion(currentVersion);

  switch(updateType) {
    case 'major':
      version.major += 1;
      version.minor = 0;
      version.patch = 0;
      break;
    case 'minor':
      version.minor += 1;
      version.patch = 0;
      break;
    case 'patch':
      version.patch += 1;
      break;
  }

  return formatVersion(version);
}

/**
 * Display git tagging command with version information
 * @param {string} version - The version to tag with
 */
function displayGitTaggingCommand(version) {
  console.log('\n========================================');
  console.log('NEXT STEPS:');
  console.log('========================================');
  console.log('To create a git tag for this release, run:');
  console.log(`\n  git add package.json`);
  console.log(`  git commit -m "Release version ${version}"`);
  console.log(`  git tag -a v${version} -m "Version ${version}"`);
  console.log(`  git push origin main --tags`);
  console.log('========================================\n');
}

/**
 * Update version based on user input
 * @returns {Promise<string>} - New version
 */
async function updateVersion() {
  try {
    const currentVersion = await getCurrentVersion();
    console.log(`Current version: ${currentVersion}`);

    const updateType = await promptVersionType();

    let newVersion;
    if (updateType === 'custom') {
      newVersion = await promptCustomVersion(currentVersion);
    } else {
      newVersion = calculateNewVersion(currentVersion, updateType);
      console.log(`New version will be: ${newVersion}`);
    }

    // Update package.json
    if (newVersion !== currentVersion) {
      await updatePackageJsonVersion(newVersion);
      console.log(`Version updated to ${newVersion} in package.json`);

      // Display git tagging commands for the new version
      displayGitTaggingCommand(newVersion);
    } else {
      console.log('Version unchanged');
    }

    return newVersion;
  } catch (error) {
    console.error('Error updating version:', error);
    throw error;
  }
}

module.exports = {
  updateVersion,
  getCurrentVersion
};

// If this script is run directly
if (require.main === module) {
  updateVersion().catch(console.error);
}
