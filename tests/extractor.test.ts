import { it, expect } from 'vitest'
import { extractJSON_valuesOnly, extractMarkdownOrMDX } from '../src/extractor'

it('Markdown: splits paragraphs and rebuilds around code/links', () => {
  const md = [
    'Intro para.',
    '```js',
    'const x = 1;',
    '```',
    'A [link](https://example.com) and `inline` code.',
    ''
  ].join('\n')
  const ex = extractMarkdownOrMDX(md)
  expect(ex.kind).toBe('markdown')
  // Only real text paragraphs should be segments
  expect(ex.segments.length).toBeGreaterThanOrEqual(2)
  const up = ex.rebuild(ex.segments.map((s) => s.toUpperCase()))
  expect(up).toContain('INTRO PARA.')
  expect(up).toContain('[link](https://example.com)') // link preserved
  expect(up).toContain('```js') // code fence preserved
})

it('extracts values and rebuilds', () => {
  const json = JSON.stringify({ buttons: { save: 'Save' }, items: ['One', 'Two'] }, null, 2)
  const ex = extractJSON_valuesOnly(json)
  expect(ex.kind).toBe('json')
  const rebuilt = ex.rebuild(ex.segments.map((s) => `[${s}]`))
  const obj = JSON.parse(rebuilt)
  expect(obj.buttons.save).toBe('[Save]')
  expect(obj.items[1]).toBe('Two')
})

