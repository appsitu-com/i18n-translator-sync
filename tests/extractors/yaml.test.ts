import { describe, it, expect } from 'vitest'
import { extractYAML } from '../../src/extractors/yaml'

describe('YAML Extractor', () => {
  it('should extract string values from a YAML document', () => {
    const input = `
title: My YAML Document
description: A test document for YAML extraction
version: 1.0
author:
  name: John Doe
  email: john@example.com
tags:
  - yaml
  - test
  - i18n
nested:
  level1:
    level2: This is a deeply nested string
items:
  - name: Item 1
    description: First item description
  - name: Item 2
    description: Second item description
`

    const result = extractYAML(input)

    expect(result.kind).toBe('yaml')
    expect(result.segments).toEqual([
      'My YAML Document',
      'A test document for YAML extraction',
      'John Doe',
      'john@example.com',
      'yaml',
      'test',
      'i18n',
      'This is a deeply nested string',
      'Item 1',
      'First item description',
      'Item 2',
      'Second item description'
    ])

    // Check that paths were extracted correctly
    expect(result.paths.length).toBe(12)
  })

  it('should rebuild the YAML document with translations', () => {
    const input = `
greeting: Hello
farewell: Goodbye
`

    const extraction = extractYAML(input)
    const translations = ['Hola', 'Adiós']
    const output = extraction.rebuild(translations)

    expect(output).toContain('greeting: Hola')
    expect(output).toContain('farewell: Adiós')
  })

  it('should handle arrays in YAML', () => {
    const input = `
colors:
  - red
  - green
  - blue
`

    const extraction = extractYAML(input)
    expect(extraction.segments).toEqual(['red', 'green', 'blue'])

    const translations = ['rojo', 'verde', 'azul']
    const output = extraction.rebuild(translations)

    expect(output).toContain('- rojo')
    expect(output).toContain('- verde')
    expect(output).toContain('- azul')
  })
})
