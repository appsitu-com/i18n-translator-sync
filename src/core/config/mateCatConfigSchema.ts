import { z } from 'zod'

const MateCatFormScalarSchema = z.union([z.string(), z.number(), z.boolean()])

export const MateCatFormValueSchema = z.union([
  MateCatFormScalarSchema,
  z.array(MateCatFormScalarSchema)
])

export const MateCatDefaultsSchema = z.record(z.string(), MateCatFormValueSchema)

export type MateCatFormValue = z.infer<typeof MateCatFormValueSchema>
export type MateCatDefaults = z.infer<typeof MateCatDefaultsSchema>
