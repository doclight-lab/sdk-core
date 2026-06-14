import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi"
import { z } from "zod"
import {
  DEFAULT_INGEST_ENDPOINT,
  INGEST_BATCH_PATH,
  ingestBatchRequestSchema,
  ingestBatchResponseSchema,
  SCHEMA_VERSION,
} from "../schema"

extendZodWithOpenApi(z)

const errorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse")

/** Example request embedded in the spec; validated in build.test.ts. */
export const EXAMPLE_INGEST_BATCH_REQUEST = {
  schemaVersion: SCHEMA_VERSION,
  projectId: "proj_abc",
  sdk: { name: "@doclight/node", version: "0.0.0" },
  events: [
    {
      eventId: "evt_1",
      timestamp: "2026-06-11T12:00:00.000Z",
      type: "session_started",
      sessionId: "sess_1",
    },
  ],
} as const

export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item)) as T
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return sorted as T
  }
  return value
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const registry = new OpenAPIRegistry()

  const IngestBatchRequest = registry.register(
    "IngestBatchRequest",
    ingestBatchRequestSchema,
  )
  const IngestBatchResponse = registry.register(
    "IngestBatchResponse",
    ingestBatchResponseSchema,
  )
  registry.register("ErrorResponse", errorResponseSchema)

  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Doclight API key",
  })

  registry.registerPath({
    method: "post",
    path: INGEST_BATCH_PATH,
    summary: "Ingest a batch of SDK events",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        description: "Batch envelope with 1–500 events",
        content: {
          "application/json": {
            schema: IngestBatchRequest,
            example: EXAMPLE_INGEST_BATCH_REQUEST,
          },
        },
      },
      headers: z.object({
        "x-doclight-sdk": z.string().openapi({
          description: "SDK identifier, e.g. @doclight/node/0.0.0",
          example: "@doclight/node/0.0.0",
        }),
      }),
    },
    responses: {
      200: {
        description: "Batch accepted (possibly with per-event rejections)",
        content: {
          "application/json": {
            schema: IngestBatchResponse,
          },
        },
      },
      400: {
        description: "Invalid request payload",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
      401: {
        description: "Missing or invalid bearer token",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
      413: {
        description: "Batch too large",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
      429: {
        description: "Rate limited",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  const generator = new OpenApiGeneratorV3(registry.definitions)
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Doclight Ingest API",
      version: "1.0.0",
      description: "SDK event ingest contract for Doclight v1",
    },
    servers: [{ url: DEFAULT_INGEST_ENDPOINT }],
  }) as unknown as Record<string, unknown>
}
