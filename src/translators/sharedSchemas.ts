import { z } from 'zod'

/** Maps application locale codes to engine-specific locale codes or names. */
export const LangMapSchema = z.record(z.string(), z.string()).default({})

/** Retry behavior for HTTP calls to a translation engine. */
export const RetrySchema = z
  .object({
    maxRetries: z.number().int().min(0).optional().default(2),
    delayMs: z.number().int().min(0).optional().default(100),
    backoffFactor: z.number().min(1).optional().default(2)
  })
  .optional()
