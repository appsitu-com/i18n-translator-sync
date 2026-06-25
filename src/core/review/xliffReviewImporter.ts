import type { Pair, ITranslationMemory } from '../tm/ITranslationMemory'
import type { ILogger } from '../util/baseLogger'
import type { IMateCatPulledFile } from './MateCatService'

export type ReviewedXliffUnit = {
  id: string
  sourceText: string
  targetText: string
}

export type ReviewedXliffFile = {
  sourcePath: string
  sourceLocale: string
  targetLocale: string
  units: ReviewedXliffUnit[]
}

const XLIFF_FILE_PATTERN = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi
const XLIFF_UNIT_PATTERN = /<(?:trans-unit|unit)\b([^>]*)>([\s\S]*?)<\/(?:trans-unit|unit)>|<(?:trans-unit|unit)\b([^>]*)\/>/gi
const SOURCE_PATTERN = /<source\b[^>]*>([\s\S]*?)<\/source>/i
const TARGET_PATTERN = /<target\b[^>]*>([\s\S]*?)<\/target>/i
const LOOKUP_SEPARATOR = '::'

function parseAttributes(attributeSource: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributePattern = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g

  for (let match = attributePattern.exec(attributeSource); match; match = attributePattern.exec(attributeSource)) {
    const [, key, , doubleQuoted, singleQuoted] = match
    attributes[key] = decodeXmlEntities((doubleQuoted ?? singleQuoted ?? '').trim())
  }

  return attributes
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, '')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractText(block: string, pattern: RegExp): string {
  const match = block.match(pattern)
  if (!match?.[1]) {
    return ''
  }

  return decodeXmlEntities(stripXmlTags(match[1]).trim())
}

function parseUnitPosition(id: string, index: number): number | string {
  const trimmed = id.trim()
  if (trimmed.length === 0) {
    return index
  }

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    return numeric
  }

  return trimmed
}

export function parseReviewedXliff(content: string, fallbackFileName: string): ReviewedXliffFile[] {
  const files: ReviewedXliffFile[] = []

  for (const fileMatch of content.matchAll(XLIFF_FILE_PATTERN)) {
    const fileAttributes = parseAttributes(fileMatch[1] ?? '')
    const fileBody = fileMatch[2] ?? ''
    const units: ReviewedXliffUnit[] = []

    let unitIndex = 0
    for (const unitMatch of fileBody.matchAll(XLIFF_UNIT_PATTERN)) {
      const unitAttributes = parseAttributes(unitMatch[1] ?? unitMatch[3] ?? '')
      const unitBody = unitMatch[2] ?? ''
      const sourceText = extractText(unitBody, SOURCE_PATTERN)
      const targetText = extractText(unitBody, TARGET_PATTERN)

      if (!sourceText || !targetText) {
        unitIndex++
        continue
      }

      units.push({
        id: unitAttributes.id ?? String(unitIndex + 1),
        sourceText,
        targetText
      })
      unitIndex++
    }

    files.push({
      sourcePath: fileAttributes.original ?? fallbackFileName,
      sourceLocale: fileAttributes['source-language'] ?? '',
      targetLocale: fileAttributes['target-language'] ?? '',
      units
    })
  }

  return files
}

export async function mergeReviewedXliffFilesIntoTranslationMemory(
  pulledFiles: IMateCatPulledFile[],
  translationMemory: ITranslationMemory,
  logger: ILogger
): Promise<number> {
  let importedUnits = 0

  for (const pulledFile of pulledFiles) {
    if (!pulledFile.fileName.toLowerCase().endsWith('.xlf') && !pulledFile.fileName.toLowerCase().endsWith('.xliff')) {
      continue
    }

    const files = parseReviewedXliff(pulledFile.content, pulledFile.fileName)
    for (const file of files) {
      if (!file.sourceLocale || !file.targetLocale) {
        logger.warn(`Skipping reviewed XLIFF without source/target language metadata: ${pulledFile.fileName}`)
        continue
      }

      if (file.units.length === 0) {
        continue
      }

      const unitPairs: Pair[] = file.units.map((unit, index) => ({
        src: unit.sourceText,
        dst: unit.targetText,
        ctx: unit.id,
        pos: parseUnitPosition(unit.id, index)
      }))

      const existingTranslations = await translationMemory.getMany({
        engine: 'matecat',
        sourceLocale: file.sourceLocale,
        targetLocale: file.targetLocale,
        texts: unitPairs.map((pair) => pair.src),
        contexts: unitPairs.map((pair) => pair.ctx ?? null),
        sourcePath: file.sourcePath,
        positions: unitPairs.map((pair) => pair.pos ?? 0)
      })

      const changedPairs = unitPairs.filter((pair) => {
        const lookupKey = `${pair.src}${LOOKUP_SEPARATOR}${(pair.ctx ?? '').toString()}`
        const existing = existingTranslations.get(lookupKey)?.translation
        return existing === undefined || existing !== pair.dst
      })

      if (changedPairs.length === 0) {
        continue
      }

      await translationMemory.putMany({
        engine: 'matecat',
        sourceLocale: file.sourceLocale,
        targetLocale: file.targetLocale,
        pairs: changedPairs,
        sourcePath: file.sourcePath,
        status: 'reviewed',
        origin: 'human'
      })

      importedUnits += changedPairs.length
    }
  }

  if (importedUnits > 0) {
    logger.info(`Imported ${importedUnits} reviewed translation unit(s) into translation memory`)
  }

  return importedUnits
}