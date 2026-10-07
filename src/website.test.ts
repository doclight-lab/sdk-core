import { describe, expect, it } from "vitest"
import { doclightEventSchema } from "./schema"
import { buildWebsiteRequestEvent, sanitizeWebsiteUrl } from "./website"

const base = {
  eventId: "evt_1",
  timestamp: "2026-06-11T12:00:00.000Z",
  httpMethod: "GET" as const,
  outcome: "completed" as const,
  httpStatus: 200,
}

describe("website sanitization", () => {
  it("strips credentials, query and fragment", () => {
    expect(
      sanitizeWebsiteUrl("https://u:p@Example.com/a/b?token=1#frag"),
    ).toEqual({ host: "example.com", route: "/a/b" })
  })

  it("rejects non-http URLs", () => {
    expect(sanitizeWebsiteUrl("javascript:alert(1)")).toBeUndefined()
    expect(sanitizeWebsiteUrl("not a url")).toBeUndefined()
  })

  it("builds a schema-valid event keeping only referrer origin", () => {
    const event = buildWebsiteRequestEvent({
      ...base,
      url: "https://user:pw@example.com/docs?x=1#y",
      referrer: "https://search.example.org/r?q=secret",
      claimedAgent: "GPTBot/1.0",
      correlationId: "corr_1",
    })
    expect(event).toBeDefined()
    expect(event?.route).toBe("/docs")
    expect(event?.referrerOrigin).toBe("https://search.example.org")
    expect(event?.agentIdentity?.verification).toBe("unverified")
    expect(doclightEventSchema.safeParse(event).success).toBe(true)
  })

  it("marks missing agent identity as unknown", () => {
    const event = buildWebsiteRequestEvent({
      ...base,
      url: "https://example.com/",
    })
    expect(event?.agentIdentity).toEqual({
      source: "unknown",
      verification: "unknown",
    })
    expect(doclightEventSchema.safeParse(event).success).toBe(true)
  })

  it("bounds long routes", () => {
    const event = buildWebsiteRequestEvent({
      ...base,
      url: `https://example.com/${"a".repeat(2000)}`,
    })
    expect(event?.route?.length).toBe(512)
    expect(doclightEventSchema.safeParse(event).success).toBe(true)
  })
})
