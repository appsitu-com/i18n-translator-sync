import type { Translator, BulkTranslateOpts } from './types'
import type { IDeepLConfig } from '../core/config'
import { postJson } from '../util/http'
import { normalizeLocaleWithMap } from '../util/localeNorm'

export const DeepLTranslator: Translator = {
  name: 'deepl',

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const cfg = opts.apiConfig as IDeepLConfig
    const authKey = cfg.apiKey
    const free = !!cfg.free
    const base =
      (cfg.endpoint ?? (free ? 'https://api-free.deepl.com' : 'https://api.deepl.com')).replace(/\/+$/, '')
    const timeout = Number(cfg.timeoutMs ?? 30_000)
    const formality = cfg.formality
    const model_type = cfg.deeplModel
    const langMap = cfg.langMap ?? {}

    if (!authKey) throw new Error(`DeepL: missing 'apiKey'`)
    const headers = { Authorization: `DeepL-Auth-Key ${authKey}` }

    // DeepL documents uppercase locale codes
    const target = normalizeLocaleWithMap(opts.targetLocale, langMap).toUpperCase()
    const source = normalizeLocaleWithMap(opts.sourceLocale, langMap).toUpperCase()

    // Group texts by context, because DeepL's 'context' parameter applies to the whole request.
    const groups = new Map<string, number[]>()
    for (let i = 0; i < texts.length; i++) {
      const c = (contexts[i] ?? '').toString()
      const key = c // group key
      const arr = groups.get(key) ?? []
      arr.push(i)
      groups.set(key, arr)
    }

    const out: string[] = new Array(texts.length)
    for (const [ctx, idxs] of groups.entries()) {
      const chunk = idxs.map((i) => texts[i])
      const url = `${base}/v2/translate`
      const body: any = {
        text: chunk,
        target_lang: target,
        source_lang: source
      }
      if (ctx) body.context = ctx
      if (formality) body.formality = formality
      if (model_type) body.model_type = model_type

      const json = await postJson<any>(url, body, headers, timeout)

      const trans = json?.translations ?? []
      for (let k = 0; k < idxs.length; k++) {
        out[idxs[k]] = trans[k]?.text ?? chunk[k]
      }
    }
    return out
  }
}
