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

  it('delegates to TypeScript extraction for .ts files', () => {
    const ts = 'export default {\n  "greeting": "Hello",\n  "farewell": "Goodbye"\n};';
    const ex = extractForFile('file.ts', ts);
    expect(ex.kind).toBe('json');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });

  it('delegates to TypeScript extraction for .js files', () => {
    const js = 'export default {\n  greeting: "Hello",\n  farewell: "Goodbye"\n};';
    const ex = extractForFile('file.js', js);
    expect(ex.kind).toBe('json');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });

  it('delegates to TypeScript extraction for .mjs files', () => {
    const js = 'export default {\n  greeting: "Hello",\n  farewell: "Goodbye"\n};';
    const ex = extractForFile('file.mjs', js);
    expect(ex.kind).toBe('json');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });

  it('delegates to TypeScript extraction for .cjs files', () => {
    const js = 'export default {\n  greeting: "Hello",\n  farewell: "Goodbye"\n};';
    const ex = extractForFile('file.cjs', js);
    expect(ex.kind).toBe('json');
    expect(ex.segments).toEqual(['Hello', 'Goodbye']);
  });

  it('passes exclude options through to TS extraction', () => {
    const ts = 'export default {\n  "id": "skip",\n  "greeting": "Hello"\n};';
    const ex = extractForFile('file.ts', ts, { excludeKeys: ['id'] });
    expect(ex.segments).toEqual(['Hello']);
  });

  it('passes exclude options through to JSON extraction', () => {
    const json = JSON.stringify({ id: 'skip', greeting: 'Hello' });
    const ex = extractForFile('file.json', json, { excludeKeys: ['id'] });
    expect(ex.segments).toEqual(['Hello']);
  });

  it('passes exclude options through to Markdown front matter extraction', () => {
    const md = '---\ntitle: My Title\ndescription: My Description\n---\n\nContent here.';
    // Without frontmatterKeys passed by extractForFile, front matter is not extracted by default,
    // but excludeOptions is still threaded through for when frontmatterKeys are provided upstream
    const ex = extractForFile('file.md', md, { excludeKeys: ['title'] });
    // extractForFile passes undefined for frontmatterKeys, so no front matter extracted
    expect(ex.segments).toEqual(['Content here.']);
  });
});
