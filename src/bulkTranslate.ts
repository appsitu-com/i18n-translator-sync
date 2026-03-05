import { getTranslator } from './translators/registry'
import type { TranslationCache } from './core/cache/sqlite'
import { TranslatorApiConfig } from './translators/types'
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

export async function bulkTranslateWithEngine(
  texts: string[],
  contexts: (string | null | undefined)[],
  engineName: string,
  opts: { source: string; target: string; apiConfig: TranslatorApiConfig },
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

  const engine = getTranslator(engineName)
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

    // Translate the missing segments
    const translated = await engine.translateMany(missTexts, missCtx, {
      sourceLocale: srcNorm,
      targetLocale: tgtNorm,
      apiConfig: opts.apiConfig
    })

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