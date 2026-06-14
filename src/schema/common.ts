import { z } from "zod"

export const DOCLIGHT_EVENT_TYPES = [
  "session_started",
  "session_completed",
  "agent_detected",
  "step_started",
  "step_completed",
  "tool_listed",
  "tool_called",
  "resource_read",
  "prompt_used",
  "api_called",
  "error_occurred",
  "retry_attempted",
  "auth_failed",
  "schema_validation_failed",
  "rate_limited",
  "timeout_occurred",
] as const

export const doclightEventTypeSchema = z.enum(DOCLIGHT_EVENT_TYPES)

export const eventSourceSchema = z.enum(["sdk", "synthetic", "manual"])

export const httpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
])

export const eventStatusSchema = z.enum([
  "success",
  "failed",
  "timeout",
  "cancelled",
])

export const dropPolicySchema = z.enum(["drop_oldest", "drop_newest"])

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const metadataRecordSchema = z
  .record(z.string(), metadataValueSchema)
  .superRefine((value, ctx) => {
    const keys = Object.keys(value)
    if (keys.length > 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "metadata must have at most 50 keys",
      })
    }

    const serialized = JSON.stringify(value)
    if (serialized.length > 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "metadata must serialize to at most 1 KB",
      })
    }
  })
