import { describe, it, expect } from 'vitest';
import { extractForFile } from '../../src/extractors/extractorRegistry';

describe('extractForFile', () => {
  it('delegates to JSON extraction for .json files', () => {
    const json = JSON.stringify({ a: 'x', b: 'y' });
    const ex = extractForFile('file.json', json);
    expect(ex.kind).toBe('json');
    expect(ex.segments).toEqual(['x', 'y']);
  });

  it('delegates to Markdown extraction for .md files', () => {
    const md = 'Hello world.';
    const ex = extractForFile('file.md', md);
    expect(ex.kind).toBe('markdown');
    expect(ex.segments).toEqual(['Hello world.']);
  });

  it('delegates to YAML extraction for .yaml files', () => {
    const yaml = 'greeting: Hello\nfarewell: Goodbye';
    const ex = extractForFile('file.yaml', yaml);
    expect(ex.kind).toBe('yaml');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });

  it('delegates to YAML extraction for .yml files', () => {
    const yml = 'greeting: Hello\nfarewell: Goodbye';
    const ex = extractForFile('file.yml', yml);
    expect(ex.kind).toBe('yaml');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });
});
