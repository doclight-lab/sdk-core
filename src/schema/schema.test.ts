import { describe, expect, it } from "vitest"
import {
  doclightConfigSchema,
  doclightEventSchema,
  ingestBatchRequestSchema,
  SCHEMA_VERSION,
} from "./index"

const VALID_TIMESTAMP = "2026-06-11T12:00:00.000Z"

function minimalEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eventId: "evt_1",
    timestamp: VALID_TIMESTAMP,
    type: "session_started",
    sessionId: "sess_1",
    ...overrides,
  }
}

describe("doclightEventSchema", () => {
  it("accepts a minimal session_started event", () => {
    const result = doclightEventSchema.safeParse(minimalEvent())
    expect(result.success).toBe(true)
  })

  it("accepts a minimal tool_called event with toolName", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({ type: "tool_called", toolName: "search" }),
    )
    expect(result.success).toBe(true)
  })

  it("accepts a minimal api_called event with apiEndpoint", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({
        type: "api_called",
        apiEndpoint: "https://api.example.com/v1/items",
      }),
    )
    expect(result.success).toBe(true)
  })

  it("accepts a minimal error_occurred event with errorType", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({ type: "error_occurred", errorType: "TimeoutError" }),
    )
    expect(result.success).toBe(true)
  })

  it("rejects an unknown event type", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({ type: "unknown_type" }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("type"))).toBe(
        true,
      )
    }
  })

  it("rejects a missing eventId", () => {
    const event = minimalEvent()
    delete event.eventId
    const result = doclightEventSchema.safeParse(event)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("eventId"))).toBe(
        true,
      )
    }
  })

  it("rejects a bad timestamp", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({ timestamp: "not-a-datetime" }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("timestamp")),
      ).toBe(true)
    }
  })

  it("rejects tool_called without toolName", () => {
    const result = doclightEventSchema.safeParse(
      minimalEvent({ type: "tool_called" }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.includes("toolName") &&
            issue.message.includes("tool_called"),
        ),
      ).toBe(true)
    }
  })

  it("rejects metadata with more than 50 keys", () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`key${index}`, "value"]),
    )
    const result = doclightEventSchema.safeParse(minimalEvent({ metadata }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("at most 50 keys"),
        ),
      ).toBe(true)
    }
  })

  it("rejects metadata over 1 KB serialized", () => {
    const metadata = { payload: "x".repeat(1025) }
    const result = doclightEventSchema.safeParse(minimalEvent({ metadata }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("at most 1 KB"),
        ),
      ).toBe(true)
    }
  })
})

describe("ingestBatchRequestSchema", () => {
  const minimalBatch = {
    schemaVersion: SCHEMA_VERSION,
    projectId: "proj_1",
    sdk: { name: "@doclight/node", version: "0.0.0" },
    events: [minimalEvent()],
  }

  it("accepts a valid minimal batch", () => {
    const result = ingestBatchRequestSchema.safeParse(minimalBatch)
    expect(result.success).toBe(true)
  })

  it("rejects a batch with 0 events", () => {
    const result = ingestBatchRequestSchema.safeParse({
      ...minimalBatch,
      events: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("events"))).toBe(
        true,
      )
    }
  })

  it("rejects a batch with 501 events", () => {
    const result = ingestBatchRequestSchema.safeParse({
      ...minimalBatch,
      events: Array.from({ length: 501 }, () => minimalEvent()),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("events"))).toBe(
        true,
      )
    }
  })
})

describe("doclightConfigSchema", () => {
  it("applies defaults when only apiKey and projectId are provided", () => {
    const config = doclightConfigSchema.parse({
      apiKey: "dl_key",
      projectId: "proj_1",
    })

    expect(config.endpoint).toBe("https://ingest.doclight.app")
    expect(config.transport.mode).toBe("async")
    expect(config.transport.batchSize).toBe(50)
    expect(config.transport.flushIntervalMs).toBe(3000)
    expect(config.transport.maxQueueSize).toBe(5000)
    expect(config.transport.requestTimeoutMs).toBe(500)
    expect(config.transport.dropPolicy).toBe("drop_oldest")
    expect(config.transport.retries).toBe(3)
    expect(config.privacy.captureContext).toBe(true)
    expect(config.privacy.redactSecrets).toBe(true)
    expect(config.debug).toBe(false)
    expect(config.enabled).toBe(true)
    expect(config.strict).toBe(false)
  })

  it("defaults captureInputs and captureOutputs to false", () => {
    const config = doclightConfigSchema.parse({
      apiKey: "dl_key",
      projectId: "proj_1",
    })

    expect(config.privacy.captureInputs).toBe(false)
    expect(config.privacy.captureOutputs).toBe(false)
  })

  it("rejects an invalid dropPolicy", () => {
    const result = doclightConfigSchema.safeParse({
      apiKey: "dl_key",
      projectId: "proj_1",
      transport: { dropPolicy: "drop_all" },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path[0] === "transport" && issue.path[1] === "dropPolicy",
        ),
      ).toBe(true)
    }
  })
})
