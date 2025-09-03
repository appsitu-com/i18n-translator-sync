import { describe, it, expect } from 'vitest';
import { extractMarkdownOrMDX, extractForFile } from '../../src/extractor';

// Markdown extraction tests
describe('extractMarkdownOrMDX', () => {
  it('extracts paragraphs, preserves code fences, links, and inline code', () => {
    const md = [
      'Hello world.',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      'A [link](https://example.com) and `inline` code.',
      '',
      'Second paragraph.'
    ].join('\n');
    const ex = extractMarkdownOrMDX(md);
    expect(ex.kind).toBe('markdown');
    expect(ex.segments.length).toBeGreaterThanOrEqual(2);
    // Test rebuild
    const rebuilt = ex.rebuild(ex.segments.map(s => `[${s}]`));
    expect(rebuilt).toContain('```js');
    expect(rebuilt).toContain('[link](https://example.com)');
    expect(rebuilt).toContain('`inline`');
    expect(rebuilt).toContain('[Hello world.]');
    expect(rebuilt).toContain('[Second paragraph.]');
  });

  it('returns empty segments for empty markdown', () => {
    const ex = extractMarkdownOrMDX('');
    expect(ex.segments).toEqual([]);
  });
});

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
});
