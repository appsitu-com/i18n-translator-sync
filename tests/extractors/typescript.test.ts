import { describe, it, expect } from 'vitest'
import {
  extractTypeScript,
  unwrapTsExport,
  wrapTsExport,
  formatAsJsLiteral
} from '../../src/extractors/typescript'

describe('formatAsJsLiteral', () => {
  it('formats strings with single quotes', () => {
    expect(formatAsJsLiteral('hello')).toBe("'hello'")
  })

  it('escapes single quotes in strings', () => {
    expect(formatAsJsLiteral("it's")).toBe("'it\\'s'")
  })

  it('formats numbers, booleans, null directly', () => {
    expect(formatAsJsLiteral(42)).toBe('42')
    expect(formatAsJsLiteral(true)).toBe('true')
    expect(formatAsJsLiteral(null)).toBe('null')
  })

  it('formats arrays with indentation', () => {
    const result = formatAsJsLiteral(['a', 'b'])
    expect(result).toContain("'a'")
    expect(result).toContain("'b'")
    expect(result).toMatch(/^\[/)
  })

  it('formats objects with unquoted keys', () => {
    const result = formatAsJsLiteral({ greeting: 'Hello' })
    expect(result).toContain("greeting: 'Hello'")
  })

  it('quotes keys that are not valid identifiers', () => {
    const result = formatAsJsLiteral({ 'my-key': 'value' })
    expect(result).toContain("'my-key': 'value'")
  })

  it('formats nested structures with proper indentation', () => {
    const data = { outer: { inner: 'value' } }
    const result = formatAsJsLiteral(data)
    expect(result).toContain('outer: {')
    expect(result).toContain("inner: 'value'")
  })
})

describe('unwrapTsExport', () => {
  it('strips export default with object literal', () => {
    const input = 'export default {"greeting": "Hello"}'
    const result = unwrapTsExport(input)
    expect(result.prefix).toBe('export default ')
    expect(result.json).toBe('{"greeting": "Hello"}')
  })

  it('handles trailing semicolon', () => {
    const input = 'export default {"greeting": "Hello"};'
    const result = unwrapTsExport(input)
    expect(result.json).toBe('{"greeting": "Hello"}')
    expect(result.suffix).toBe(';')
  })

  it('handles as const suffix', () => {
    const input = 'export default {"greeting": "Hello"} as const;'
    const result = unwrapTsExport(input)
    expect(result.json).toBe('{"greeting": "Hello"}')
    expect(result.suffix).toContain('as const')
  })

  it('handles multiline JSON', () => {
    const input = `export default {
  "greeting": "Hello",
  "farewell": "Goodbye"
};`
    const result = unwrapTsExport(input)
    expect(result.prefix).toBe('export default ')
    const parsed = JSON.parse(result.json)
    expect(parsed.greeting).toBe('Hello')
    expect(parsed.farewell).toBe('Goodbye')
  })

  it('throws for unsupported shapes', () => {
    expect(() => unwrapTsExport('const x = 5')).toThrow('Unsupported TypeScript shape')
    expect(() => unwrapTsExport('import foo from "bar"')).toThrow('Unsupported TypeScript shape')
  })
})

describe('wrapTsExport', () => {
  it('restores export default wrapper', () => {
    const result = wrapTsExport('export default ', '{"greeting": "Hola"}', ';')
    expect(result).toBe('export default {"greeting": "Hola"};\n')
  })

  it('handles empty suffix', () => {
    const result = wrapTsExport('export default ', '{"a": 1}', '')
    expect(result).toBe('export default {"a": 1}\n')
  })
})

describe('extractTypeScript', () => {
  it('extracts strings from a TS default export with JSON syntax', () => {
    const input = `export default {
  "greeting": "Hello",
  "farewell": "Goodbye"
};`
    const extraction = extractTypeScript(input)
    expect(extraction.kind).toBe('json')
    expect(extraction.segments).toEqual(['Hello', 'Goodbye'])
  })

  it('extracts strings from JS literal syntax (unquoted keys, single quotes)', () => {
    const input = `export default {
  greeting: 'Hello',
  farewell: 'Goodbye'
} as const`
    const extraction = extractTypeScript(input)
    expect(extraction.kind).toBe('json')
    expect(extraction.segments).toEqual(['Hello', 'Goodbye'])
  })

  it('extracts nested structures', () => {
    const input = `export default {
  messages: {
    welcome: 'Welcome',
    error: 'Error occurred'
  },
  count: 42
};`
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual(['Welcome', 'Error occurred'])
  })

  it('rebuilds with translations and preserves export wrapper', () => {
    const input = `export default {
  greeting: 'Hello',
  farewell: 'Goodbye'
} as const;`
    const extraction = extractTypeScript(input)
    const output = extraction.rebuild(['Hola', 'Adiós'])
    expect(output).toContain('export default')
    expect(output).toContain("'Hola'")
    expect(output).toContain("'Adiós'")
    expect(output).toContain('greeting:')
    expect(output).toContain('farewell:')
  })

  it('rebuilds with translations from JSON syntax input', () => {
    const input = `export default {
  "greeting": "Hello",
  "farewell": "Goodbye"
};`
    const extraction = extractTypeScript(input)
    const output = extraction.rebuild(['Hola', 'Adiós'])
    expect(output).toContain('export default')
    // Output is JS literal style
    expect(output).toContain("greeting: 'Hola'")
    expect(output).toContain("farewell: 'Adiós'")
  })

  it('throws for variable export', () => {
    expect(() => extractTypeScript('export default messages;')).toThrow()
  })

  it('supports array exports with single quotes', () => {
    const input = "export default ['Hello', 'World'];"
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual(['Hello', 'World'])
  })

  it('supports array of objects (locales-style)', () => {
    const input = `export default [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' }
] as const`
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual([
      'en', 'English', 'English',
      'es', 'Spanish', 'Español'
    ])
  })

  it('extracts from messages-style file with nested objects and arrays', () => {
    const input = `export default {
  greeting: 'Hello, world!',
  farewell: 'Goodbye, world!',
  nested: {
    welcome: 'Welcome to the translation system.',
    thanks: 'Thank you for using our service.'
  },
  list: ['First item', 'Second item', 'Third item']
} as const`
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual([
      'Hello, world!',
      'Goodbye, world!',
      'Welcome to the translation system.',
      'Thank you for using our service.',
      'First item',
      'Second item',
      'Third item'
    ])
  })

  it('respects excludeKeys option', () => {
    const input = `export default {
  id: 'msg-001',
  greeting: 'Hello',
  meta: {
    id: 'meta-id',
    label: 'Meta Label'
  }
};`
    const extraction = extractTypeScript(input, { excludeKeys: ['id'] })
    expect(extraction.segments).toEqual(['Hello', 'Meta Label'])
  })

  it('respects excludeKeyPaths option', () => {
    const input = `export default {
  greeting: 'Hello',
  meta: {
    version: '1.0',
    label: 'Label'
  }
};`
    const extraction = extractTypeScript(input, { excludeKeyPaths: ['meta.version'] })
    expect(extraction.segments).toEqual(['Hello', 'Label'])
  })

  it('preserves excluded values in rebuild', () => {
    const input = `export default {
  id: 'keep-this',
  greeting: 'Hello',
  farewell: 'Goodbye'
};`
    const extraction = extractTypeScript(input, { excludeKeys: ['id'] })
    expect(extraction.segments).toEqual(['Hello', 'Goodbye'])
    const output = extraction.rebuild(['Hola', 'Adiós'])
    expect(output).toContain("id: 'keep-this'")
    expect(output).toContain("greeting: 'Hola'")
    expect(output).toContain("farewell: 'Adiós'")
    expect(output).toMatch(/^export default /)
  })

  it('preserves excluded path value in rebuild', () => {
    const input = `export default {
  meta: {
    version: '1.0',
    label: 'Meta Label'
  },
  greeting: 'Hello'
};`
    const extraction = extractTypeScript(input, { excludeKeyPaths: ['meta.version'] })
    expect(extraction.segments).toEqual(['Meta Label', 'Hello'])
    const output = extraction.rebuild(['Étiquette', 'Bonjour'])
    expect(output).toContain("version: '1.0'")
    expect(output).toContain("label: 'Étiquette'")
    expect(output).toContain("greeting: 'Bonjour'")
  })

  it('handles TS files with comments (JSON5 feature)', () => {
    const input = `export default {
  // Main greeting
  greeting: 'Hello',
  /* Farewell message */
  farewell: 'Goodbye'
} as const`
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual(['Hello', 'Goodbye'])
  })

  it('handles trailing commas (JSON5 feature)', () => {
    const input = `export default {
  greeting: 'Hello',
  farewell: 'Goodbye',
} as const`
    const extraction = extractTypeScript(input)
    expect(extraction.segments).toEqual(['Hello', 'Goodbye'])
  })
})
