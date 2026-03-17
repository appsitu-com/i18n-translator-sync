import { getRegisteredTranslator } from './translators/registry'
import type { TranslationCache } from './core/cache/sqlite'
import type { EngineConfig } from './translators/types'
import { normalizeLocaleWithMap } from './util/localeNorm'

/**
 * Statistics about a translation operation
 */
export interface TranslationStats {
  /** Number of segments translated via API */
  apiCalls: number
  /** Number of segments fetched from cache */
  cacheHits: number
  /** Total number of segments processed */
  total: number
}

interface TranslationChunk {
  texts: string[]
  contexts: string[]
}

function buildTranslationChunks(
  texts: string[],
  contexts: string[],
  maxItemsPerRequest: number,
  maxCharsPerRequest: number
): TranslationChunk[] {
  const chunks: TranslationChunk[] = []
  let currentTexts: string[] = []
  let currentContexts: string[] = []
  let currentChars = 0

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    const context = contexts[i]
    const textCharCount = text.length

    if (textCharCount > maxCharsPerRequest) {
      throw new Error(
        `Segment exceeds max translation characters per request (${textCharCount} > ${maxCharsPerRequest})`
      )
    }

    const chunkIsFull = currentTexts.length >= maxItemsPerRequest
    const charsWouldOverflow = currentChars + textCharCount > maxCharsPerRequest

    if (currentTexts.length > 0 && (chunkIsFull || charsWouldOverflow)) {
      chunks.push({ texts: currentTexts, contexts: currentContexts })
      currentTexts = []
      currentContexts = []
      currentChars = 0
    }

    currentTexts.push(text)
    currentContexts.push(context)
    currentChars += textCharCount
  }

  if (currentTexts.length > 0) {
    chunks.push({ texts: currentTexts, contexts: currentContexts })
  }

  return chunks
}

export async function bulkTranslateWithEngine(
  texts: string[],
  contexts: (string | null | undefined)[],
  engineName: string,
  opts: { source: string; target: string; apiConfig: EngineConfig; rootDir: string },
  cache: TranslationCache,
  sourcePath?: string
): Promise<{ translations: string[]; stats: TranslationStats }> {
  if (!texts.length) {
    return {
      translations: [],
      stats: {
        apiCalls: 0,
        cacheHits: 0,
        total: 0
      }
    }
  }

  const {
    translator: engine,
    limit: translationLimit,
    maxchars: translationMaxChars
  } = getRegisteredTranslator(engineName)
  const langMap = opts.apiConfig.langMap || {}
  const srcNorm = normalizeLocaleWithMap(opts.source, langMap)
  const tgtNorm = normalizeLocaleWithMap(opts.target, langMap)

  const uniq: Array<{ t: string; c: string; pos: number }> = []
  const seen = new Set<string>()

  // Use a readable separator that can be easily seen in database queries
  // Previous version used \u0001 (SOH control character) which wasn't readable
  const SEPARATOR = '::'; // Using :: as a more readable separator

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    const c = (contexts[i] ?? '').toString()
    const k = `${t}${SEPARATOR}${c}`
    if (!seen.has(k)) {
      seen.add(k)
      uniq.push({ t, c, pos: i })
    }
  }

  const cached = await cache.getMany({
    engine: engine.name,
    source: srcNorm,
    target: tgtNorm,
    texts: uniq.map((u) => u.t),
    contexts: uniq.map((u) => u.c),
    sourcePath: sourcePath,
    positions: uniq.map((u) => u.pos)
  })

  const misses = uniq.filter((u) => !cached.has(`${u.t}${SEPARATOR}${u.c}`))

  if (misses.length) {
    const missTexts = misses.map((m) => m.t)
    const missCtx = misses.map((m) => m.c)

    // Translate the missing segments in chunks to respect per-engine request limits.
    const translated: string[] = []
    const chunks = buildTranslationChunks(missTexts, missCtx, translationLimit, translationMaxChars)
    for (const chunk of chunks) {
      const chunkTexts = chunk.texts
      const chunkContexts = chunk.contexts
      const chunkTranslated = await engine.translateMany(chunkTexts, chunkContexts, {
        sourceLocale: srcNorm,
        targetLocale: tgtNorm,
        apiConfig: opts.apiConfig,
        rootDir: opts.rootDir
      })
      translated.push(...chunkTranslated)
    }

    if (translated.length !== misses.length) {
      throw new Error(
        `Translator '${engine.name}' returned ${translated.length} translations for ${misses.length} inputs`
      )
    }

    // Always cache translations, even for "copy" engine
    await cache.putMany({
      engine: engine.name,
      source: srcNorm,
      target: tgtNorm,
      pairs: misses.map((m, i) => ({ src: m.t, dst: translated[i], ctx: m.c, pos: m.pos })),
      sourcePath: sourcePath
    })

    misses.forEach((m, i) => cached.set(`${m.t}${SEPARATOR}${m.c}`, { translation: translated[i], textPos: m.pos }))
  }

  const translations = texts.map((t, i) => {
    const entry = cached.get(`${t}${SEPARATOR}${(contexts[i] ?? '').toString()}`)
    return entry?.translation ?? t
  })

  // Note: For the copy engine, apiCalls represents the number of "identity mappings" created
  // though they don't consume API quota. We count them separately for consistency.
  const stats: TranslationStats = {
    apiCalls: engineName === 'copy' ? 0 : misses.length,
    cacheHits: uniq.length - misses.length,
    total: uniq.length
  }

  return { translations, stats }
}