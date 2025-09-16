import { getTranslator } from './translators/registry'
import type { TranslationCache } from './cache.sqlite'
import { TranslatorApiConfig } from './translators/types'

export async function bulkTranslateWithEngine(
  texts: string[],
  contexts: (string | null | undefined)[],
  engineName: string,
  opts: { source: string; target: string; apiConfig: TranslatorApiConfig },
  cache: TranslationCache
): Promise<string[]> {
  if (!texts.length) return []

  const engine = getTranslator(engineName)
  const srcNorm = engine.normalizeLocale(opts.source)
  const tgtNorm = engine.normalizeLocale(opts.target)

  const uniq: Array<{ t: string; c: string }> = []
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
      uniq.push({ t, c })
    }
  }

  const cached = await cache.getMany({
    engine: engine.name,
    source: srcNorm,
    target: tgtNorm,
    texts: uniq.map((u) => u.t),
    contexts: uniq.map((u) => u.c)
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
      pairs: misses.map((m, i) => ({ src: m.t, dst: translated[i], ctx: m.c }))
    })

    misses.forEach((m, i) => cached.set(`${m.t}${SEPARATOR}${m.c}`, translated[i]))
  }
  return texts.map((t, i) => cached.get(`${t}${SEPARATOR}${(contexts[i] ?? '').toString()}`) ?? t)
}
