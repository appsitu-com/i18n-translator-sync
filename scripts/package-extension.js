#!/usr/bin/env node

/**
 * Extension Packaging Script
 *
 * This script handles the complete packaging workflow for the i18n-translator-vscode extension:
 * 1. Ensures required dependencies are installed
 * 2. Updates package.json with required metadata for publishing
 * 3. Creates icon and other assets if missing
 * 4. Updates version based on user choice (major, minor, patch)
 * 5. Builds the extension
 * 6. Packages it into a VSIX file ready for publishing in the releases folder
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const { updateVersion } = require('./update-version');

// Constants
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const ICON_SVG_PATH = path.join(ROOT_DIR, 'images', 'icon.svg');
const ICON_PNG_PATH = path.join(ROOT_DIR, 'images', 'icon.png');
const PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const RELEASES_DIR = path.join(ROOT_DIR, 'releases');

// Utilities
function execPromise(command) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${command}`);
    exec(command, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
        return;
      }
      console.log(`stdout: ${stdout}`);
      resolve(stdout);
    });
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${url} to ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

async function ensureDependencyInstalled() {
  try {
    console.log('Checking for global @vscode/vsce installation...');
    await execPromise('pnpm list -g @vscode/vsce || pnpm add -g @vscode/vsce');
    console.log('Global @vscode/vsce is installed via npm.');
  } catch (error) {
    console.error('Error ensuring @vscode/vsce is installed:', error);
    process.exit(1);
  }
}

async function updatePackageJson() {
  console.log('Updating package.json with required metadata...');

  try {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

    // Ensure required fields exist
    const updates = {
      description: "Instantly translates Markdown/MDX, YAML, JSON and TypeScript/JSON files. Fast, caching and highly configurable.",
      keywords: ["i18n", "translation", "localization", "azure", "google", "deepl", "gemini", "markdown", "mdx", "json", "yaml"],
      homepage: "https://github.com/appsitu-com/i18n-translator-sync.git",
      repository: {
        type: "git",
        url: "https://github.com/appsitu-com/i18n-translator-sync.git.git"
      },
      bugs: {
        url: "https://github.com/appsitu-com/i18n-translator-sync.git/issues"
      },
      author: {
        name: "Tony O'Hagan"
      },
      license: "MIT",
      icon: "images/icon.png",  // Use PNG for best compatibility with the marketplace
      galleryBanner: {
        color: "#ef4444",  // Match the blue color of the icon
        theme: "dark"
      },
      categories: ["Other", "Machine Learning", "Formatters"],
      preview: true
    };

    // Update package.json with new fields
    const updatedPackageJson = { ...packageJson, ...updates };

    // Write updated package.json
    fs.writeFileSync(
      PACKAGE_JSON_PATH,
      JSON.stringify(updatedPackageJson, null, 2),
      'utf-8'
    );

    console.log('package.json updated successfully');
  } catch (error) {
    console.error('Error updating package.json:', error);
    process.exit(1);
  }
}

async function ensureAssets() {
  console.log('Ensuring required assets exist...');

  try {
    // Create images directory if it doesn't exist
    const imagesDir = path.dirname(ICON_SVG_PATH);
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
      console.log(`Created directory: ${imagesDir}`);
    }

    // Create releases directory if it doesn't exist
    if (!fs.existsSync(RELEASES_DIR)) {
      fs.mkdirSync(RELEASES_DIR, { recursive: true });
      console.log(`Created releases directory: ${RELEASES_DIR}`);
    }

    // Ensure we have both SVG and PNG icons
    // VS Code supports SVG icons, but the Marketplace may prefer PNGs

    // First ensure we have an SVG icon
    const svgExists = fs.existsSync(ICON_SVG_PATH);
    if (!svgExists) {
      console.log('Creating SVG icon...');

      // Create a custom SVG icon for the extension
      const svgIcon = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <!-- Background globe -->
  <circle cx="64" cy="64" r="62" fill="#0078d4" />

  <!-- World map stylized grid lines -->
  <path d="M64 10 A54 54 0 0 1 64 118 A54 54 0 0 1 64 10" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />
  <path d="M15 64 L113 64" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />
  <path d="M26 32 L102 32" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />
  <path d="M26 96 L102 96" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />
  <path d="M40 18 L40 110" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />
  <path d="M88 18 L88 110" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" />

  <!-- Text inside -->
  <text x="64" y="62" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">i18n</text>
  <text x="64" y="88" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">Translator</text>
</svg>`;

      fs.writeFileSync(ICON_SVG_PATH, svgIcon, 'utf8');
      console.log(`Created SVG icon at ${ICON_SVG_PATH}`);
    } else {
      console.log('SVG icon already exists');
    }

    // Now ensure we have a PNG icon
    try {
      if (!fs.existsSync(ICON_PNG_PATH) || process.argv.includes('--force-icon-generation')) {
        console.log('Converting SVG to PNG for marketplace compatibility...');

        if (svgExists) {
          try {
            // Import sharp dynamically to avoid requiring it if not needed
            const sharp = require('sharp');

            // Standard icon dimensions for VS Code extensions
            const dimensions = [128, 128]; // Width, Height in pixels

            // Read the SVG
            const svgBuffer = fs.readFileSync(ICON_SVG_PATH);

            // Process the conversion asynchronously
            console.log(`Converting SVG to PNG with dimensions ${dimensions[0]}x${dimensions[1]}px...`);
            await sharp(svgBuffer)
              .resize(dimensions[0], dimensions[1])
              .png()
              .toFile(ICON_PNG_PATH);

            console.log(`Successfully converted SVG to PNG: ${ICON_PNG_PATH}`);
          } catch (sharpError) {
            console.error(`Error converting SVG to PNG: ${sharpError.message}`);
            console.log('Falling back to SVG copy method...');

            // Fallback to simple copy if sharp fails
            fs.copyFileSync(ICON_SVG_PATH, ICON_PNG_PATH);
            console.log(`Copied SVG icon to PNG path as fallback: ${ICON_PNG_PATH}`);
          }
        } else {
          // Use a placeholder PNG if we don't have an SVG
          console.log('No SVG icon found. Will use placeholder PNG.');

          // Create a placeholder - you would normally use a real PNG here
          const defaultPng = Buffer.from(
            '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',
            'base64'
          );
          fs.writeFileSync(ICON_PNG_PATH, defaultPng);
          console.log(`Created default PNG icon at ${ICON_PNG_PATH}`);
        }
      } else {
        console.log('PNG icon already exists');
      }
    } catch (iconError) {
      console.error(`Error handling icons: ${iconError.message}`);
      console.log('Continuing with packaging process despite icon error...');
    }

    // Ensure the samples directory exists
    const samplesDir = path.join(ROOT_DIR, 'samples');
    if (!fs.existsSync(samplesDir)) {
      fs.mkdirSync(samplesDir, { recursive: true });
      console.log(`Created samples directory: ${samplesDir}`);
    }

    // Ensure the sample translation config files exist
    const translateJsonSample = path.join(samplesDir, 'translator.json');
    const translateEnvSample = path.join(samplesDir, 'translator.env');
    const translateJson = path.join(ROOT_DIR, 'translator.json');
    const translateEnv = path.join(ROOT_DIR, 'translator.env');

    // Check if sample files exist in the samples directory
    if (!fs.existsSync(translateJsonSample)) {
      console.log('samples/translator.json does not exist. Please create it manually.');
    } else {
      console.log('samples/translator.json already exists');
    }

    if (!fs.existsSync(translateEnvSample)) {
      console.log('samples/translator.env does not exist. Please create it manually.');
    } else {
      console.log('samples/translator.env already exists');
    }
  } catch (error) {
    console.error('Error ensuring assets exist:', error);
    process.exit(1);
  }
}

async function copyConfigurationSamples() {
  console.log('Copying configuration sample files to dist...');

  try {
    const samplesDir = path.join(ROOT_DIR, 'samples');
    const sourceEnvSample = path.join(samplesDir, 'translator.env');
    const sourceJsonSample = path.join(samplesDir, 'translator.json');
    const distSamplesDir = path.join(ROOT_DIR, 'dist', 'samples');

    // Make sure the dist/samples directory exists
    if (!fs.existsSync(distSamplesDir)) {
      fs.mkdirSync(distSamplesDir, { recursive: true });
      console.log(`Created dist/samples directory: ${distSamplesDir}`);
    }

    // Copy the sample configuration files to the dist/samples directory
    if (fs.existsSync(sourceEnvSample)) {
      fs.copyFileSync(sourceEnvSample, path.join(distSamplesDir, 'translator.env'));
      console.log(`Copied samples/translator.env to dist/samples folder`);
    } else {
      console.error(`samples/translator.env not found`);
    }

    if (fs.existsSync(sourceJsonSample)) {
      fs.copyFileSync(sourceJsonSample, path.join(distSamplesDir, 'translator.json'));
      console.log(`Copied samples/translator.json to dist/samples folder`);
    } else {
      console.error(`samples/translator.json not found`);
    }
  } catch (error) {
    console.error('Error copying configuration samples:', error);
  }
}

async function buildExtension() {
  console.log('Building extension with pnpm...');

  try {
    await execPromise('pnpm build');
    console.log('Extension built successfully using pnpm');

    // Copy configuration sample files after build
    await copyConfigurationSamples();
  } catch (error) {
    console.error('Error building extension:', error);
    process.exit(1);
  }
}

async function packageExtension(newVersion) {
  console.log('Packaging extension...');

  try {
    // Get version from parameter
    const version = newVersion;

    // Create releases directory if it doesn't exist
    if (!fs.existsSync(RELEASES_DIR)) {
      fs.mkdirSync(RELEASES_DIR, { recursive: true });
      console.log(`Created releases directory: ${RELEASES_DIR}`);
    }

    // Run prepublish script with pnpm (local)
    console.log('Running prepublish script with pnpm...');
    await execPromise('pnpm vscode:prepublish');

    // Package with vsce into the releases directory
    console.log('Packaging with @vscode/vsce...');
    // Use the proper package command with native dependency handling
    await execPromise(`pnpm exec vsce package --out "${RELEASES_DIR}"`);

    const vsixName = `${RELEASES_DIR}/i18n-translator-vscode-${version}.vsix`;
    console.log(`Extension packaged successfully as ${vsixName}`);

    return vsixName;
  } catch (error) {
    console.error('Error packaging extension:', error);
    process.exit(1);
  }
}

async function ensureDependencies() {
  try {
    console.log('Checking for required dependencies...');

    // Check for sharp dependency
    try {
      require('sharp');
      console.log('sharp is installed');
    } catch (e) {
      console.log('sharp is not installed, installing now...');
      await execPromise('pnpm add -D sharp');
      console.log('sharp installed successfully');
    }

    // Check for global @vscode/vsce
    await ensureDependencyInstalled();
  } catch (error) {
    console.error('Error ensuring dependencies:', error);
    throw error;
  }
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
  console.log('\nThis will:');
  console.log(' 1. Commit the version change to package.json');
  console.log(' 2. Create an annotated tag for the release');
  console.log(' 3. Push the changes and tags to the remote repository');
  console.log('========================================\n');
}

async function main() {
  console.log('Starting extension packaging process...');
  console.log('Command line arguments:', process.argv);

  const forceIconGeneration = process.argv.includes('--force-icon-generation');
  if (forceIconGeneration) {
    console.log('Force icon generation flag detected. Will regenerate PNG icon from SVG.');
  }

  // Check if version is provided as command line argument
  const versionParam = process.argv.find(arg => arg.startsWith('--version='));
  let providedVersion = null;
  if (versionParam) {
    providedVersion = versionParam.split('=')[1];
    console.log(`Version provided as parameter: ${providedVersion}`);
  }

  try {
    // First ensure all dependencies are installed
    await ensureDependencies();

    // Use provided version or prompt user for version update type
    const newVersion = providedVersion || await updateVersion();

    // Ensure all required assets exist
    await ensureAssets();

    // Update package.json with required metadata
    await updatePackageJson();

    // Build the extension
    await buildExtension();

    // Package the extension with the new version
    const vsixPath = await packageExtension(newVersion);

    console.log('Extension packaging completed successfully!');
    console.log(`VSIX file created: ${vsixPath}`);
    console.log(`Version: ${newVersion}`);

    // Display git tagging commands for the new version
    displayGitTaggingCommand(newVersion);
  } catch (error) {
    console.error('Extension packaging failed:', error);
    process.exit(1);
  }
}

main();
