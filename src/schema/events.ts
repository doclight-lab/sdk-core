import { z } from "zod"
import {
  DOCLIGHT_EVENT_TYPES,
  agentIdentitySourceSchema,
  agentIdentityVerificationSchema,
  doclightEventTypeSchema,
  eventSourceSchema,
  eventStatusSchema,
  httpMethodSchema,
  metadataRecordSchema,
  websiteOutcomeSchema,
} from "./common"

/** Lowercase hostname with optional port; IP literals are rejected. */
const WEBSITE_HOST_RE = /^(?!\d+(?:\.\d+){3}(?::\d+)?$)[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/
const WEBSITE_ORIGIN_RE = /^https?:\/\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/
const WEBSITE_ROUTE_RE = /^\/[^?#\s]*$/
const CORRELATION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/

export const WEBSITE_MAX_DURATION_MS = 86_400_000

export const websiteHostSchema = z.string().max(260).regex(WEBSITE_HOST_RE)
export const websiteRouteSchema = z
  .string()
  .max(512)
  .regex(WEBSITE_ROUTE_RE)
  .refine((v) => ![...v].some((c) => c.charCodeAt(0) < 0x20 || c === "\x7f"), {
    message: "route must not contain control characters",
  })
export const websiteReferrerOriginSchema = z
  .string()
  .max(270)
  .regex(WEBSITE_ORIGIN_RE)
export const websiteCorrelationIdSchema = z
  .string()
  .regex(CORRELATION_ID_RE)

/**
 * Agent identity evidence for a website request. A claimed identity is never
 * treated as verified identity.
 */
export const agentIdentityEvidenceSchema = z.object({
  claimed: z.string().min(1).max(128).optional(),
  source: agentIdentitySourceSchema,
  verification: agentIdentityVerificationSchema,
})

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
  /** Required for all types except website_request (no fictitious task). */
  sessionId: z.string().min(1).optional(),
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
  // website_request fields (additive, optional for other types)
  host: websiteHostSchema.optional(),
  route: websiteRouteSchema.optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  outcome: websiteOutcomeSchema.optional(),
  agentIdentity: agentIdentityEvidenceSchema.optional(),
  referrerOrigin: websiteReferrerOriginSchema.optional(),
  correlationId: websiteCorrelationIdSchema.optional(),
  metadata: metadataRecordSchema.optional(),
  context: metadataRecordSchema.optional(),
})

/**
 * Structural (refinement-free) event variants. Runtime validation uses
 * doclightEventSchema below; these exist so the generated OpenAPI document
 * can express "sessionId required except for website_request" and the
 * completed/aborted status rule with oneOf instead of custom refinements.
 */
const standardEventSchema = baseEventSchema.extend({
  type: z.enum(
    DOCLIGHT_EVENT_TYPES.filter((t) => t !== "website_request") as [
      Exclude<(typeof DOCLIGHT_EVENT_TYPES)[number], "website_request">,
      ...Exclude<(typeof DOCLIGHT_EVENT_TYPES)[number], "website_request">[],
    ],
  ),
  sessionId: z.string().min(1),
})

const websiteRequestBase = baseEventSchema.extend({
  type: z.literal("website_request"),
  host: websiteHostSchema,
  route: websiteRouteSchema,
  httpMethod: httpMethodSchema,
  durationMs: z.number().int().nonnegative().max(WEBSITE_MAX_DURATION_MS).optional(),
})

const websiteCompletedEventSchema = websiteRequestBase.extend({
  outcome: z.literal("completed"),
  httpStatus: z.number().int().min(100).max(599),
})

const websiteAbortedEventSchema = websiteRequestBase.extend({
  outcome: z.literal("aborted"),
})

export const doclightEventOpenApiSchema = z.union([
  standardEventSchema,
  websiteCompletedEventSchema,
  websiteAbortedEventSchema,
])

export const doclightEventSchema = baseEventSchema.superRefine((event, ctx) => {
  if (event.type !== "website_request" && !event.sessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sessionId is required for non-website_request events",
      path: ["sessionId"],
    })
  }

  if (event.type === "website_request") {
    const required = ["host", "route", "httpMethod", "outcome"] as const
    for (const field of required) {
      if (!event[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `website_request events require ${field}`,
          path: [field],
        })
      }
    }
    if (event.outcome === "completed" && event.httpStatus === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completed website_request events require httpStatus",
        path: ["httpStatus"],
      })
    }
    if (
      event.durationMs !== undefined &&
      event.durationMs > WEBSITE_MAX_DURATION_MS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "website_request durationMs must be at most 24h",
        path: ["durationMs"],
      })
    }
  }

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
