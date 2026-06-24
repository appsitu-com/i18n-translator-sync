import { z } from 'zod'
import type { ITranslator, IBulkTranslateOpts } from './types';

/** Copy engine (no-op, returns input unchanged) config schema */
export const CopyConfigSchema = z.object({}).optional().default({})

/** Inferred Copy config type */
export type ICopyConfig = z.infer<typeof CopyConfigSchema>

export const CopyTranslator: ITranslator<ICopyConfig> = {
  name: 'copy',
  async translateMany(texts: string[], _contexts: (string|null|undefined)[], _opts: IBulkTranslateOpts<ICopyConfig>) { return texts.slice(); }
};
