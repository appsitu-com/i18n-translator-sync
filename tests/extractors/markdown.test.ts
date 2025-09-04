import { describe, it, expect } from 'vitest'
import { extractMarkdownOrMDX } from '../../src/extractors/markdown'

describe('extractMarkdownOrMDX', () => {
  it('extracts paragraphs and rebuilds with translations', () => {
    const md = [
      'Hello world.',
      '',
      '```js',
      'const a = 1;',
      '```',
      '',
      'A [link](https://example.com) and `inline` code.',
      '',
      'Second paragraph.'
    ].join('\n')

    const ex = extractMarkdownOrMDX(md)
    expect(ex.kind).toBe('markdown')

    // We expect paragraphs: "Hello world.", "A link and inline code.", and "Second paragraph."
    expect(ex.segments).toEqual(['Hello world.', 'A ', 'link', ' and ', ' code.', 'Second paragraph.'])

    // Test rebuild with translations enclosed in brackets
    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual([
      'HELLO WORLD.',
      '',
      '```js',
      'const a = 1;',
      '```',
      '',
      'A [LINK](https://example.com) AND `inline` CODE.',
      '',
      'SECOND PARAGRAPH.'
    ])

    // // The rebuilt text should still contain code blocks and links
    // expect(rebuilt).toContain('```js');
    // expect(rebuilt).toContain('const a = 1;');
    // expect(rebuilt).toContain('https://example.com');
    // expect(rebuilt).toContain('`inline`');

    // // And it should contain our translated text
    // expect(rebuilt).toContain('[Hello world.]');
    // expect(rebuilt).toContain('[Second paragraph.]');
  })

  it('extracts frontmatter values', () => {
    const md = [
      '---',
      'title: My Title',
      'description: My Description',
      'draft: true',
      '---',
      '',
      'Content here.'
    ].join('\n')

    const ex = extractMarkdownOrMDX(md, ['title', 'description'])

    expect(ex.segments).toEqual(['My Title', 'My Description', 'Content here.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual([
      '---',
      'title: MY TITLE',
      'description: MY DESCRIPTION',
      'draft: true',
      '',
      '---',
      '',
      'CONTENT HERE.'
    ])
  })

  it('handles empty input', () => {
    const ex = extractMarkdownOrMDX('')
    expect(ex.segments).toEqual([])

    const rebuilt = ex.rebuild([])
    expect(rebuilt).toBe('')
  })

  it('should extract and translate headers', () => {
    const md = '# Hello everyone!'
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['Hello everyone!'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)

    expect(rebuilt).toBe('# HELLO EVERYONE!')
  })

  it('should not extract content from code blocks', () => {
    const md = "```\nconsole.log('Hello, everyone!');\n```"
    const ex = extractMarkdownOrMDX(md)

    // There should be no segments to translate in a pure code block
    expect(ex.segments.length).toBe(0)

    const rebuilt = ex.rebuild([])
    expect(rebuilt).toEqual(md)
  })

  it('should extract text while preserving inline code', () => {
    const md = 'Use `console.log` to print to the console.'
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['Use ', ' to print to the console.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')
    expect(result).toEqual(['USE `console.log` TO PRINT TO THE CONSOLE.'])
  })

  it('should extract text around a code block', () => {
    const md = ['Before the code block.', '```js', 'line 1', 'line 2', '```', 'after the code block.'].join('\n')
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['Before the code block.', 'after the code block.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual([
      'BEFORE THE CODE BLOCK.',
      '',
      '```js',
      'line 1',
      'line 2',
      '```',
      '',
      'AFTER THE CODE BLOCK.'
    ])
  })

  it('should extract text from links but preserve URLs', () => {
    const md = 'Visit [GitHub](https://github.com) for more information.'
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['Visit ', 'GitHub', ' for more information.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')
    expect(result).toEqual(['VISIT [GITHUB](https://github.com) FOR MORE INFORMATION.'])
  })

  it('should extract text from links with titles', () => {
    const md = 'Visit [Duck Duck Go](https://duckduckgo.com "best for privacy").'
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['Visit ', 'best for privacy', 'Duck Duck Go', '.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual(['VISIT [DUCK DUCK GO](https://duckduckgo.com "BEST FOR PRIVACY").'])
  })

  it('should extract image alt text', () => {
    const md = 'before ![GitHub Logo](/images/logo.png) after'
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(['before ', 'GitHub Logo', ' after'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual(['BEFORE ![GITHUB LOGO](/images/logo.png) AFTER'])
  })

  it('should preserve formatting with bold and italic text', () => {
    const md = "Here's some *italics*, and some **bold text**."
    const ex = extractMarkdownOrMDX(md)

    expect(ex.segments).toEqual(["Here's some ", 'italics', ', and some ', 'bold text', '.'])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual(["HERE'S SOME *ITALICS*, AND SOME **BOLD TEXT**."])
  })

  it('should handle MDX components', () => {
    const md = `
# This is an MDX post

With some content and a JSX component: <MyComponent>with children</MyComponent>

More text after the component.
`
    const ex = extractMarkdownOrMDX(md)

    // We expect to extract text before and after component
    expect(ex.segments).toEqual([
      'This is an MDX post',
      'With some content and a JSX component: ',
      'with children',
      'More text after the component.'
    ])

    const translations = ex.segments.map((s) => s.toUpperCase())
    const rebuilt = ex.rebuild(translations)
    const result = rebuilt.split('\n')

    expect(result).toEqual([
      '# THIS IS AN MDX POST',
      '',
      'WITH SOME CONTENT AND A JSX COMPONENT: <MyComponent>WITH CHILDREN</MyComponent>',
      '',
      'MORE TEXT AFTER THE COMPONENT.',
      ''
    ])
  })

  it('should handle complex frontmatter with nested values', () => {
    const md = `---
title: Complex Frontmatter
description: Testing nested values
metadata:
  author: John Doe
  tags:
    - markdown
    - test
---

Content after frontmatter.`

    const ex = extractMarkdownOrMDX(md, ['title', 'description'])

    expect(ex.segments).toEqual(['Complex Frontmatter', 'Testing nested values', 'Content after frontmatter.'])

    const rebuilt = ex.rebuild(['New Title', 'New Description', 'New Content'])
    const result = rebuilt.split('\n')
    expect(result).toEqual([
      '---',
      'title: New Title',
      'description: New Description',
      'metadata:',
      '  author: John Doe',
      '  tags:',
      '    - markdown',
      '    - test',
      '',
      '---',
      '',
      'New Content'
    ])
  })
})
