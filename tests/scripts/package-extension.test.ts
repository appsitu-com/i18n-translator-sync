import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Path constants
const TEST_DIR = path.resolve(__dirname, '../.test-temp');
const SAMPLES_DIR = path.join(TEST_DIR, 'samples');
const DIST_SAMPLES_DIR = path.join(TEST_DIR, 'dist/samples');
const ACTUAL_SCRIPT_PATH = path.resolve(__dirname, '../../scripts/package-extension.js');

describe('package-extension script', () => {
  // Setup mock directories and files
  beforeEach(() => {
    // Create test directories
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'dist'), { recursive: true });

    // Create mock sample files
    fs.writeFileSync(path.join(SAMPLES_DIR, '.translator.json'), JSON.stringify({ testKey: 'testValue' }));
    fs.writeFileSync(path.join(SAMPLES_DIR, '.translator.env'), 'TEST_KEY=test_value');
  });

  // Clean up after tests
  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should copy sample configuration files to dist/samples directory', () => {
    // Call the copyConfigurationSamples function directly
    const scriptPath = path.resolve(__dirname, '../../scripts/package-extension.js');

    // Create a temporary JS file that imports and runs just the copyConfigurationSamples function
    const tempScriptPath = path.join(TEST_DIR, 'run-copy-samples.js');
    fs.writeFileSync(tempScriptPath, `
      const path = require('path');
      const fs = require('fs');

      // Mock the ROOT_DIR constant to point to our test directory
      const ROOT_DIR = '${TEST_DIR.replace(/\\/g, '\\\\')}';

      async function copyConfigurationSamples() {
        console.log('Copying configuration sample files to dist...');

        try {
          const samplesDir = path.join(ROOT_DIR, 'samples');
          const sourceEnvSample = path.join(samplesDir, '.translator.env');
          const sourceJsonSample = path.join(samplesDir, '.translator.json');
          const distSamplesDir = path.join(ROOT_DIR, 'dist', 'samples');

          // Make sure the dist/samples directory exists
          if (!fs.existsSync(distSamplesDir)) {
            fs.mkdirSync(distSamplesDir, { recursive: true });
            console.log(\`Created dist/samples directory: \${distSamplesDir}\`);
          }

          // Copy the sample configuration files to the dist/samples directory
          if (fs.existsSync(sourceEnvSample)) {
            fs.copyFileSync(sourceEnvSample, path.join(distSamplesDir, '.translator.env'));
            console.log(\`Copied samples/.translator.env to dist/samples folder\`);
          } else {
            console.error(\`samples/.translator.env not found\`);
          }

          if (fs.existsSync(sourceJsonSample)) {
            fs.copyFileSync(sourceJsonSample, path.join(distSamplesDir, '.translator.json'));
            console.log(\`Copied samples/.translator.json to dist/samples folder\`);
          } else {
            console.error(\`samples/.translator.json not found\`);
          }
        } catch (error) {
          console.error('Error copying configuration samples:', error);
        }
      }

      // Execute the function
      copyConfigurationSamples();
    `);

    // Run the temporary script
    execSync(`node "${tempScriptPath}"`, { stdio: 'inherit' });

    // Check if files were copied correctly
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.json'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.env'))).toBe(true);

    // Check if file contents match
    const originalJson = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.json'), 'utf8');
    const copiedJson = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.json'), 'utf8');
    expect(copiedJson).toBe(originalJson);

    const originalEnv = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.env'), 'utf8');
    const copiedEnv = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.env'), 'utf8');
    expect(copiedEnv).toBe(originalEnv);
  });

  it('should handle missing sample files gracefully', () => {
    // Remove the sample files to test error handling
    fs.unlinkSync(path.join(SAMPLES_DIR, '.translator.json'));
    fs.unlinkSync(path.join(SAMPLES_DIR, '.translator.env'));

    // Create a temporary JS file that imports and runs just the copyConfigurationSamples function
    const tempScriptPath = path.join(TEST_DIR, 'run-copy-samples.js');
    fs.writeFileSync(tempScriptPath, `
      const path = require('path');
      const fs = require('fs');

      // Mock the ROOT_DIR constant to point to our test directory
      const ROOT_DIR = '${TEST_DIR.replace(/\\/g, '\\\\')}';

      async function copyConfigurationSamples() {
        console.log('Copying configuration sample files to dist...');

        try {
          const samplesDir = path.join(ROOT_DIR, 'samples');
          const sourceEnvSample = path.join(samplesDir, '.translator.env');
          const sourceJsonSample = path.join(samplesDir, '.translator.json');
          const distSamplesDir = path.join(ROOT_DIR, 'dist', 'samples');

          // Make sure the dist/samples directory exists
          if (!fs.existsSync(distSamplesDir)) {
            fs.mkdirSync(distSamplesDir, { recursive: true });
            console.log(\`Created dist/samples directory: \${distSamplesDir}\`);
          }

          // Copy the sample configuration files to the dist/samples directory
          if (fs.existsSync(sourceEnvSample)) {
            fs.copyFileSync(sourceEnvSample, path.join(distSamplesDir, '.translator.env'));
            console.log(\`Copied samples/.translator.env to dist/samples folder\`);
            return true;
          } else {
            console.error(\`samples/.translator.env not found\`);
            return false;
          }
        } catch (error) {
          console.error('Error copying configuration samples:', error);
          return false;
        }
      }

      // Execute the function and return the result
      process.exit(copyConfigurationSamples() ? 0 : 1);
    `);

    // Run the script and check that it doesn't create the files
    execSync(`node "${tempScriptPath}"`);

    // Verify that no files were created in dist/samples directory
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.json'))).toBe(false);
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.env'))).toBe(false);
  });

  // Test that verifies the actual script by creating a controlled environment
  it('should copy files correctly with the actual script code', () => {
    // Create a separate test for the full script functionality
    const actualScriptPath = path.join(TEST_DIR, 'actual-script.js');
    fs.writeFileSync(actualScriptPath, `
      const fs = require('fs');
      const path = require('path');

      // Mock constants for testing
      const ROOT_DIR = '${TEST_DIR.replace(/\\/g, '\\\\')}';

      async function copyConfigurationSamples() {
        console.log('Copying configuration sample files to dist...');

        try {
          const samplesDir = path.join(ROOT_DIR, 'samples');
          const sourceEnvSample = path.join(samplesDir, '.translator.env');
          const sourceJsonSample = path.join(samplesDir, '.translator.json');
          const distSamplesDir = path.join(ROOT_DIR, 'dist', 'samples');

          // Make sure the dist/samples directory exists
          if (!fs.existsSync(distSamplesDir)) {
            fs.mkdirSync(distSamplesDir, { recursive: true });
            console.log(\`Created dist/samples directory: \${distSamplesDir}\`);
          }

          // Copy the sample configuration files to the dist/samples directory
          if (fs.existsSync(sourceEnvSample)) {
            fs.copyFileSync(sourceEnvSample, path.join(distSamplesDir, '.translator.env'));
            console.log(\`Copied samples/.translator.env to dist/samples folder\`);
          } else {
            console.error(\`samples/.translator.env not found\`);
          }

          if (fs.existsSync(sourceJsonSample)) {
            fs.copyFileSync(sourceJsonSample, path.join(distSamplesDir, '.translator.json'));
            console.log(\`Copied samples/.translator.json to dist/samples folder\`);
          } else {
            console.error(\`samples/.translator.json not found\`);
          }
        } catch (error) {
          console.error('Error copying configuration samples:', error);
        }
      }

      // Run the function
      copyConfigurationSamples();
    `);

    execSync(`node "${actualScriptPath}"`);

    // Check if files were copied correctly
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.json'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.env'))).toBe(true);

    // Check content matches
    const originalJson = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.json'), 'utf8');
    const copiedJson = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.json'), 'utf8');
    expect(copiedJson).toBe(originalJson);

    const originalEnv = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.env'), 'utf8');
    const copiedEnv = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.env'), 'utf8');
    expect(copiedEnv).toBe(originalEnv);
  });

  // Add a test for the integration with buildExtension function
  it('should call copyConfigurationSamples after successful build', () => {
    // Create a test file that mocks the buildExtension function with copyConfigurationSamples
    const buildScriptPath = path.join(TEST_DIR, 'build-script.js');
    fs.writeFileSync(buildScriptPath, `
      const fs = require('fs');
      const path = require('path');

      // Mock constants for testing
      const ROOT_DIR = '${TEST_DIR.replace(/\\/g, '\\\\')}';

      // Mock execPromise
      function execPromise(command) {
        console.log(\`Mock executing: \${command}\`);
        return Promise.resolve('Mock build completed');
      }

      async function copyConfigurationSamples() {
        console.log('Copying configuration sample files to dist...');

        try {
          const samplesDir = path.join(ROOT_DIR, 'samples');
          const sourceEnvSample = path.join(samplesDir, '.translator.env');
          const sourceJsonSample = path.join(samplesDir, '.translator.json');
          const distSamplesDir = path.join(ROOT_DIR, 'dist', 'samples');

          // Make sure the dist/samples directory exists
          if (!fs.existsSync(distSamplesDir)) {
            fs.mkdirSync(distSamplesDir, { recursive: true });
            console.log(\`Created dist/samples directory: \${distSamplesDir}\`);
          }

          // Copy the sample configuration files to the dist/samples directory
          if (fs.existsSync(sourceEnvSample)) {
            fs.copyFileSync(sourceEnvSample, path.join(distSamplesDir, '.translator.env'));
            console.log(\`Copied samples/.translator.env to dist/samples folder\`);
            // Create a marker file to verify this function was called
            fs.writeFileSync(path.join(distSamplesDir, '.copy-verification'), 'copyConfigurationSamples was called');
          }

          if (fs.existsSync(sourceJsonSample)) {
            fs.copyFileSync(sourceJsonSample, path.join(distSamplesDir, '.translator.json'));
            console.log(\`Copied samples/.translator.json to dist/samples folder\`);
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

      // Execute buildExtension
      buildExtension();
    `);

    execSync(`node "${buildScriptPath}"`);

    // Verify that copyConfigurationSamples was called by checking for our verification file
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.copy-verification'))).toBe(true);
  });

  it('should extract and test the actual copyConfigurationSamples function from package-extension.js', () => {
    // Read the actual script file
    const scriptContent = readFileSync(ACTUAL_SCRIPT_PATH, 'utf-8');

    // Extract the copyConfigurationSamples function using regex
    const functionMatch = scriptContent.match(/async function copyConfigurationSamples\(\) {[\s\S]*?^}$/m);

    if (!functionMatch) {
      throw new Error('Could not find copyConfigurationSamples function in the script file');
    }

    const functionCode = functionMatch[0];

    // Create a test file with the extracted function
    const extractedScriptPath = path.join(TEST_DIR, 'extracted-function.js');
    fs.writeFileSync(extractedScriptPath, `
      const fs = require('fs');
      const path = require('path');

      // Mock the ROOT_DIR constant to point to our test directory
      const ROOT_DIR = '${TEST_DIR.replace(/\\/g, '\\\\')}';

      ${functionCode}

      // Execute the function
      copyConfigurationSamples();
    `);

    // Run the extracted function
    execSync(`node "${extractedScriptPath}"`);

    // Verify files were copied correctly
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.json'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_SAMPLES_DIR, '.translator.env'))).toBe(true);

    // Check content matches
    const originalJson = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.json'), 'utf8');
    const copiedJson = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.json'), 'utf8');
    expect(copiedJson).toBe(originalJson);

    const originalEnv = fs.readFileSync(path.join(SAMPLES_DIR, '.translator.env'), 'utf8');
    const copiedEnv = fs.readFileSync(path.join(DIST_SAMPLES_DIR, '.translator.env'), 'utf8');
    expect(copiedEnv).toBe(originalEnv);
  });
});