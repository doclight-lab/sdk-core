import { z } from "zod"
import { doclightEventSchema } from "./events"
import { SCHEMA_VERSION } from "./version"

/**
 * schemaVersion applies to the batch ingest contract, not individual events.
 * Additive field changes stay within the current version; breaking changes
 * require bumping SCHEMA_VERSION.
 */
export const ingestBatchRequestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string().min(1),
  sdk: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  events: z.array(doclightEventSchema).min(1).max(500),
})

export const ingestBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  errors: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        reason: z.string(),
      }),
    )
    .optional(),
})

export type IngestBatchRequest = z.infer<typeof ingestBatchRequestSchema>
export type IngestBatchResponse = z.infer<typeof ingestBatchResponseSchema>
