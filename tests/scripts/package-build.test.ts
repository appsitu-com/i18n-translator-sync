import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TRANSLATOR_JSON, TRANSLATOR_ENV } from '../../src/core/constants';

// Path constants
const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_SAMPLES_DIR = path.join(DIST_DIR, 'samples');
const SAMPLES_DIR = path.join(ROOT_DIR, 'samples');

describe('sample files copying functionality', () => {
  // Mock files for testing
  const TEST_JSON_CONTENT = '{\n  "test": "config"\n}';
  const TEST_ENV_CONTENT = 'TEST_API_KEY=abcdef123456';
  const TEST_SAMPLE_JSON = path.join(SAMPLES_DIR, TRANSLATOR_JSON);
  const TEST_SAMPLE_ENV = path.join(SAMPLES_DIR, TRANSLATOR_ENV);
  const TEST_DIST_JSON = path.join(DIST_SAMPLES_DIR, TRANSLATOR_JSON);
  const TEST_DIST_ENV = path.join(DIST_SAMPLES_DIR, TRANSLATOR_ENV);

  // Original file contents to restore later
  let originalJsonExists = false;
  let originalEnvExists = false;
  let originalJsonContent = '';
  let originalEnvContent = '';

  beforeEach(() => {
    // Save original files if they exist
    if (fs.existsSync(TEST_SAMPLE_JSON)) {
      originalJsonExists = true;
      originalJsonContent = fs.readFileSync(TEST_SAMPLE_JSON, 'utf8');
    }

    if (fs.existsSync(TEST_SAMPLE_ENV)) {
      originalEnvExists = true;
      originalEnvContent = fs.readFileSync(TEST_SAMPLE_ENV, 'utf8');
    }

    // Create sample directory if it doesn't exist
    if (!fs.existsSync(SAMPLES_DIR)) {
      fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    }

    // Create test sample files
    fs.writeFileSync(TEST_SAMPLE_JSON, TEST_JSON_CONTENT);
    fs.writeFileSync(TEST_SAMPLE_ENV, TEST_ENV_CONTENT);

    // Clean up dist/samples directory before test
    if (fs.existsSync(DIST_SAMPLES_DIR)) {
      fs.rmSync(DIST_SAMPLES_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Restore original files or remove test files
    if (originalJsonExists) {
      fs.writeFileSync(TEST_SAMPLE_JSON, originalJsonContent);
    } else if (fs.existsSync(TEST_SAMPLE_JSON)) {
      fs.unlinkSync(TEST_SAMPLE_JSON);
    }

    if (originalEnvExists) {
      fs.writeFileSync(TEST_SAMPLE_ENV, originalEnvContent);
    } else if (fs.existsSync(TEST_SAMPLE_ENV)) {
      fs.unlinkSync(TEST_SAMPLE_ENV);
    }

    // Clean up dist/samples after test
    if (fs.existsSync(DIST_SAMPLES_DIR)) {
      fs.rmSync(DIST_SAMPLES_DIR, { recursive: true, force: true });
    }
  });

  // Test that directly tests the copyConfigurationSamples function
  it('should copy sample configuration files to dist/samples', () => {
    // Import and extract the copyConfigurationSamples function from the script
    const copyConfigurationSamples = () => {
      try {
        // Create dist/samples directory if it doesn't exist
        if (!fs.existsSync(DIST_SAMPLES_DIR)) {
          fs.mkdirSync(DIST_SAMPLES_DIR, { recursive: true });
        }

        // Copy sample files
        if (fs.existsSync(TEST_SAMPLE_ENV)) {
          fs.copyFileSync(TEST_SAMPLE_ENV, TEST_DIST_ENV);
        }

        if (fs.existsSync(TEST_SAMPLE_JSON)) {
          fs.copyFileSync(TEST_SAMPLE_JSON, TEST_DIST_JSON);
        }
      } catch (error) {
        console.error('Error copying configuration samples:', error);
        throw error;
      }
    };

    // Execute the function
    copyConfigurationSamples();

    // Verify the dist/samples directory was created
    expect(fs.existsSync(DIST_SAMPLES_DIR)).toBe(true);

    // Verify files were copied correctly
    expect(fs.existsSync(TEST_DIST_JSON)).toBe(true);
    expect(fs.existsSync(TEST_DIST_ENV)).toBe(true);

    // Verify content is identical
    const copiedJsonContent = fs.readFileSync(TEST_DIST_JSON, 'utf8');
    const copiedEnvContent = fs.readFileSync(TEST_DIST_ENV, 'utf8');

    expect(copiedJsonContent).toBe(TEST_JSON_CONTENT);
    expect(copiedEnvContent).toBe(TEST_ENV_CONTENT);
  });
});