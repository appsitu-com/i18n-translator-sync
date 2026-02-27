import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Test the isEnvFileConfigured logic
 * This tests that the reminder message will not appear for properly configured .translator.env files
 */
describe('Environment File Configuration Detection', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  // Helper function that mirrors the isEnvFileConfigured logic from extension.ts
  function isEnvFileConfigured(envFilePath: string): boolean {
    try {
      if (!fs.existsSync(envFilePath)) {
        return false
      }

      const content = fs.readFileSync(envFilePath, 'utf-8')

      // Skip empty files or files that only have comments/whitespace
      const lines = content.split('\n').filter((line) => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('#')
      })

      if (lines.length === 0) {
        return false
      }

      // Check if any line has a real API key (not a placeholder like TEST_API_KEY=abcdef123456)
      for (const line of lines) {
        const [key, ...valueParts] = line.split('=')
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')

        // Skip if no key or value
        if (!key?.trim() || !value) {
          continue
        }

        // Skip obvious placeholders (the sample key, or values that are too short)
        if (value === 'abcdef123456' || value.length < 8) {
          continue
        }

        // Found a real API key - file is configured
        return true
      }

      return false
    } catch (error) {
      // If there's any error reading the file, assume it's not properly configured
      return false
    }
  }

  it('should return false for non-existent file', () => {
    const envPath = path.join(tempDir, '.translator.env')
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return false for empty file', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, '')
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return false for file with only comments', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(
      envPath,
      `# This is a comment
# Another comment
# API keys go here
`
    )
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return false for file with only placeholder keys', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, 'TEST_API_KEY=abcdef123456\n')
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return false for file with whitespace-only values', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, 'SOME_KEY=   \n')
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return false for file with too-short values', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, 'SHORT_KEY=abc123\n')
    expect(isEnvFileConfigured(envPath)).toBe(false)
  })

  it('should return true for file with real Azure key', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, "AZURE_TRANSLATION_KEY='2f04626f92914d7885503d4d03d018b8'\n")
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with real Google key', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, "GOOGLE_TRANSLATION_KEY='AIzaSyAJKfmNaexRLapyt0AQQY-Dy1bJ_I_TNXY'\n")
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with multiple keys and comments', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(
      envPath,
      `# Azure configuration
AZURE_TRANSLATION_KEY='2f04626f92914d7885503d4d03d018b8'
AZURE_TRANSLATION_REGION='westus'

# Google configuration
GOOGLE_TRANSLATION_KEY='AIzaSyAJKfmNaexRLapyt0AQQY-Dy1bJ_I_TNXY'
`
    )
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with DeepL key', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, "DEEPL_TRANSLATION_KEY='d57b625a-a8ef-4fdb-a6ff-9d442477dea9:fx'\n")
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with OpenRouter key', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(
      envPath,
      "OPENROUTER_API_KEY='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'\n"
    )
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with quoted values', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, 'API_KEY="some-very-long-api-key-here-12345678"\n')
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should return true for file with unquoted values', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(envPath, 'API_KEY=some-very-long-api-key-here-12345678\n')
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should handle files with empty lines and real keys', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(
      envPath,
      `
AZURE_TRANSLATION_KEY='2f04626f92914d7885503d4d03d018b8'

GOOGLE_TRANSLATION_KEY='AIzaSyAJKfmNaexRLapyt0AQQY-Dy1bJ_I_TNXY'
`
    )
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })

  it('should ignore lines with key but no equals sign', () => {
    const envPath = path.join(tempDir, '.translator.env')
    fs.writeFileSync(
      envPath,
      `INVALID_LINE_NO_EQUALS
AZURE_TRANSLATION_KEY='2f04626f92914d7885503d4d03d018b8'
`
    )
    expect(isEnvFileConfigured(envPath)).toBe(true)
  })
})
