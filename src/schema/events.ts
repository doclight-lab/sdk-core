import { z } from "zod"
import {
  doclightEventTypeSchema,
  eventSourceSchema,
  eventStatusSchema,
  httpMethodSchema,
  metadataRecordSchema,
} from "./common"

/**
 * Wire format uses camelCase field names.
 *
 * schemaVersion is intentionally omitted from per-event payloads; it lives on
 * the batch ingest envelope only so individual events stay lean.
 */
export const baseEventSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: doclightEventTypeSchema,
  sessionId: z.string().min(1),
  traceId: z.string().optional(),
  parentId: z.string().optional(),
  source: eventSourceSchema.optional(),
  environment: z.string().optional(),
  agentType: z.string().optional(),
  agentVendor: z.string().optional(),
  model: z.string().optional(),
  goal: z.string().optional(),
  stepName: z.string().optional(),
  toolName: z.string().optional(),
  mcpServerName: z.string().optional(),
  apiEndpoint: z.string().optional(),
  httpMethod: httpMethodSchema.optional(),
  status: eventStatusSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  errorType: z.string().optional(),
  errorMessageRedacted: z.string().optional(),
  inputSchemaHash: z.string().optional(),
  outputSchemaHash: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
  context: metadataRecordSchema.optional(),
})

export const doclightEventSchema = baseEventSchema.superRefine((event, ctx) => {
  if (event.type === "tool_called" && !event.toolName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "tool_called events require toolName",
      path: ["toolName"],
    })
  }

  if (event.type === "api_called" && !event.apiEndpoint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "api_called events require apiEndpoint",
      path: ["apiEndpoint"],
    })
  }

  if (event.type === "error_occurred" && !event.errorType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "error_occurred events require errorType",
      path: ["errorType"],
    })
  }
})

export type DoclightEventType = z.infer<typeof doclightEventTypeSchema>
export type DoclightEvent = z.infer<typeof doclightEventSchema>
