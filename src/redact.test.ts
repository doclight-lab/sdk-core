import { doclightEventSchema } from "./schema"
import { describe, expect, it } from "vitest"
import { REDACTION_PATTERNS, redactEvent, redactString } from "./redact"

const SAMPLES: Record<string, string> = {
  bearer_token: "Authorization: Bearer abc123token456",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  api_key_prefixes: "key=sk_live_abc123secret456",
  openai_anthropic_keys: "token sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
  url_userinfo: "connect to https://user:secretpass@example.com/path",
  password_param: "login?password=hunter2&user=admin",
  pem_private_key:
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----",
  postgres_url: "postgres://dbuser:dbpass@localhost:5432/mydb",
  mysql_url: "mysql://root:s3cret@127.0.0.1:3306/app",
}

describe("redactString", () => {
  for (const { name } of REDACTION_PATTERNS) {
    it(`redacts ${name}`, () => {
      const sample = SAMPLES[name]
      expect(sample).toBeDefined()
      const result = redactString(sample!)
      expect(result).toContain("[REDACTED]")
      expect(result).not.toBe(sample)
    })
  }

  it("passes clean strings through untouched", () => {
    const clean = "hello world 12345"
    expect(redactString(clean)).toBe(clean)
  })
})

describe("redactEvent", () => {
  it("redacts secrets inside metadata values", () => {
    const event = redactEvent(
      {
        eventId: "e1",
        timestamp: "2026-06-11T12:00:00.000Z",
        type: "session_started",
        sessionId: "s1",
        metadata: {
          note: "token Bearer secretvalue123",
          count: 3,
        },
      },
      true,
    )
    expect(event.metadata?.note).toContain("[REDACTED]")
    expect(event.metadata?.count).toBe(3)
  })

  it("skips redaction when disabled", () => {
    const raw = "Bearer keepme"
    const event = redactEvent(
      {
        eventId: "e1",
        timestamp: "2026-06-11T12:00:00.000Z",
        type: "session_started",
        sessionId: "s1",
        goal: raw,
      },
      false,
    )
    expect(event.goal).toBe(raw)
  })
})

describe("website_request redaction", () => {
  const event = {
    eventId: "e1",
    timestamp: "2026-06-11T12:00:00.000Z",
    type: "website_request" as const,
    host: "example.com",
    route: "/docs",
    httpMethod: "GET" as const,
    outcome: "completed" as const,
    httpStatus: 200,
    correlationId: "sk_live_abc123",
    agentIdentity: {
      claimed: "bot Bearer abcdef123456",
      source: "header" as const,
      verification: "unverified" as const,
    },
  }

  it("redacts nested claimed agent identity", () => {
    const out = redactEvent(event, true)
    expect(out.agentIdentity?.claimed).not.toContain("abcdef123456")
    expect(event.agentIdentity.claimed).toContain("abcdef123456")
  })

  it("keeps redacted correlation ids schema-valid", () => {
    const out = redactEvent(event, true)
    expect(out.correlationId).toBe("REDACTED")
    expect(doclightEventSchema.safeParse(out).success).toBe(true)
  })
})
