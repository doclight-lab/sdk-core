import { z } from "zod"
import { dropPolicySchema } from "./common"
import { DEFAULT_INGEST_ENDPOINT } from "./version"

export const doclightConfigSchema = z.object({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
  endpoint: z.string().url().default(DEFAULT_INGEST_ENDPOINT),
  environment: z.string().optional(),
  transport: z
    .object({
      mode: z.literal("async").default("async"),
      batchSize: z.number().int().positive().default(50),
      flushIntervalMs: z.number().int().positive().default(3000),
      maxQueueSize: z.number().int().positive().default(5000),
      requestTimeoutMs: z.number().int().positive().default(500),
      dropPolicy: dropPolicySchema.default("drop_oldest"),
      retries: z.number().int().nonnegative().default(3),
    })
    .default({}),
  privacy: z
    .object({
      captureInputs: z.boolean().default(false),
      captureOutputs: z.boolean().default(false),
      captureContext: z.boolean().default(true),
      redactSecrets: z.boolean().default(true),
    })
    .default({}),
  debug: z.boolean().default(false),
  enabled: z.boolean().default(true),
  strict: z.boolean().default(false),
})

export type DoclightConfigInput = z.input<typeof doclightConfigSchema>
export type ResolvedDoclightConfig = z.output<typeof doclightConfigSchema>
