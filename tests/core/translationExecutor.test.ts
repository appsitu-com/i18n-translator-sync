import { describe, it, expect } from 'vitest'
import { TranslationCommand, ITranslationExecutor } from '../../src/core/translationExecutor'
import { IUri } from '../../src/core/util/fs'
import { TranslatorEngine } from '../../src/translators/types'

describe('TranslationExecutor Interface', () => {
  it('should define TranslationCommand structure correctly', () => {
    const command: TranslationCommand = {
      type: 'translate',
      segments: ['Hello', 'World'],
      contexts: [null, 'greeting'],
      engine: 'copy',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourceFile: '/test/file.json',
      isBackTranslation: false
    }

    expect(command.type).toBe('translate')
    expect(command.segments).toEqual(['Hello', 'World'])
    expect(command.contexts).toEqual([null, 'greeting'])
    expect(command.engine).toBe('copy')
    expect(command.sourceLocale).toBe('en')
    expect(command.targetLocale).toBe('fr')
    expect(command.sourceFile).toBe('/test/file.json')
    expect(command.isBackTranslation).toBe(false)
  })

  it('should define write command structure correctly', () => {
    const mockUri: IUri = {
      fsPath: '/test/output.json',
      path: '/test/output.json',
      scheme: 'file'
    }

    const command: TranslationCommand = {
      type: 'write',
      targetUri: mockUri,
      content: '{"hello": "bonjour"}',
      sourceFile: '/test/input.json',
      isBackTranslation: false
    }

    expect(command.type).toBe('write')
    expect(command.targetUri).toBe(mockUri)
    expect(command.content).toBe('{"hello": "bonjour"}')
    expect(command.sourceFile).toBe('/test/input.json')
  })

  it('should validate ITranslationExecutor interface methods', () => {
    // This test ensures the interface is properly defined
    const mockExecutor: ITranslationExecutor = {
      translateSegments: async (
        segments: string[],
        contexts: (string | null)[],
        engineName: TranslatorEngine,
        sourceLocale: string,
        targetLocale: string,
        configProvider: { get: <T>(section: string, defaultValue?: T) => T },
        sourceFile: string,
        isBackTranslation: boolean
      ): Promise<string[]> => {
        return segments.map(s => `[${engineName}:${sourceLocale}->${targetLocale}] ${s}`)
      },

      writeTranslation: async (
        targetUri: IUri,
        content: string,
        sourceFile: string,
        isBackTranslation: boolean
      ): Promise<void> => {
        // Mock implementation
      }
    }

    expect(typeof mockExecutor.translateSegments).toBe('function')
    expect(typeof mockExecutor.writeTranslation).toBe('function')
  })

  it('should support optional properties in TranslationCommand', () => {
    const minimalCommand: TranslationCommand = {
      type: 'translate'
    }

    expect(minimalCommand.type).toBe('translate')
    expect(minimalCommand.segments).toBeUndefined()
    expect(minimalCommand.contexts).toBeUndefined()
    expect(minimalCommand.engine).toBeUndefined()
  })
})