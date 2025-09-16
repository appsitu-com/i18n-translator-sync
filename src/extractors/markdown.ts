import { remark } from 'remark'
import stringify from 'remark-stringify'
import frontmatter from 'remark-frontmatter'
import remarkMdx from 'remark-mdx';

import yaml from 'js-yaml'

import { visit } from 'unist-util-visit'

export type MarkdownExtraction = {
  kind: 'markdown';
  segments: string[]; // text segments to be translated
  contexts?: (string | null)[]; // context of translation segments
  rebuild(translated: string[]): string;
};

/**
 * Extract text segments to be translated from Markdown or MDX content.
 * @param markdown Markdown or MDX content
 * @param frontmatterKeys Frontmatter keys to be translated
 */
export function extractMarkdownOrMDX(markdown: string, frontmatterKeys?: string[]): MarkdownExtraction {
  const processor = remark().use(frontmatter, ['yaml']).use(remarkMdx).use(stringify, { bullet: '-' });

    // Parse markdown to an AST model
    const ast = processor.parse(markdown)
    // console.log('ast>>', JSON.stringify(ast, null, 2)) // KEEP

    // Extract text segments to be translated
    const segments = extractFromAST(ast, frontmatterKeys)

    const rebuild = (translations: string[]) => {
      // Update AST with a copy of the translated texts
      // traverse in same order to pop from the end of the array
      updateASTWithTranslations(ast, translations.slice(), frontmatterKeys)
      const result = processor.stringify(ast) // Convert AST back to markdown
      return (!markdown.endsWith('\n') && result.endsWith('\n')) ? result.slice(0, -1) : result
    }

    return { kind: 'markdown', segments, rebuild }
}

function extractFromAST(tree: any, frontmatterKeys?: string[]): string[] {
  const segments: string[] = []
  visit(tree, (node) => {
    for (const attr of translateMarkdownAttributes(node.type)) {
      const val = node[attr]
      if (val && typeof val === 'string') {
        if (node.type === 'yaml') {
            extractFromFrontMatter(node.value, segments, frontmatterKeys)
          } else {
            segments.push(val)
          }
        }
      }
    })

    return segments
  }

  function updateASTWithTranslations(tree: any, translations: string[], frontmatterKeys?: string[]): void {
    visit(tree, (node) => {
      for (const attr of translateMarkdownAttributes(node.type)) {
        const val = node[attr]
        if (val && typeof val === 'string') {
          if (node.type === 'yaml') {
            node[attr] = updateFrontmatterWithTranslations(node[attr], translations, frontmatterKeys)
          } else {
            node[attr] = translations.shift()
          }
        }
      }
    })
  }

// Return list of node attributes that contain translatable text
function translateMarkdownAttributes(nodeType: string): string[] {
    switch (nodeType) {
      case 'text':
        return ['value']

      case 'link':
        return ['title']

      case 'image':
        return ['title', 'alt']

      case 'yaml':
        return ['value']

      default:
        return []
    }
  }

  function extractFromFrontMatter(value: string, segments: string[], frontmatterKeys?: string[]): void {
    if (!frontmatterKeys || frontmatterKeys.length === 0) return
    const frontmatter = yaml.load(value) as Record<string, any> // parse frontmatter as YAML
    const keys = Object.keys(frontmatter).filter(k => frontmatterKeys.includes(k))
    for (const key of keys) {
      const val = frontmatter[key]
      if (val && typeof val === 'string') {
        segments.push(val)
      }
    }
  }

 function updateFrontmatterWithTranslations(value: string, translations: string[], frontmatterKeys?: string[]): string {
    if (!frontmatterKeys || frontmatterKeys.length === 0) return value

    const frontmatter = yaml.load(value) as Record<string, any> // parse frontmatter as YAML
    const keys = Object.keys(frontmatter).filter(k => frontmatterKeys.includes(k))
    for (const key of keys) {
      const val = frontmatter[key]
      if (val && typeof val === 'string') {
        // preserve space often trimmed by translation engines
        const leadingSpace = val.startsWith(' ') ? ' ' : ''
        const trailingSpace = val.endsWith(' ') ? ' ' : ''
        frontmatter[key] = leadingSpace + translations.shift()?.trim() + trailingSpace
      }
    }

    return yaml.dump(frontmatter)
  }