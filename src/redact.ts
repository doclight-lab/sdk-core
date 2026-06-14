import type { DoclightEvent } from "./schema"

const REDACTED = "[REDACTED]"

const BASE64URL = "[A-Za-z0-9_-]+"

export const REDACTION_PATTERNS: ReadonlyArray<{
  name: string
  pattern: RegExp
}> = [
  {
    name: "bearer_token",
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  },
  {
    name: "jwt",
    pattern: new RegExp(
      `eyJ${BASE64URL}\\.eyJ${BASE64URL}\\.${BASE64URL}`,
      "g",
    ),
  },
  {
    name: "api_key_prefixes",
    pattern:
      /(?:sk_live_|pk_live_|sk-|rk_|ghp_|gho_|xoxb-|AKIA[A-Z0-9]{16})[A-Za-z0-9_-]+/g,
  },
  {
    name: "openai_anthropic_keys",
    pattern: /sk-(?:ant|proj)-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "url_userinfo",
    pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@[^\s/]+/gi,
  },
  {
    name: "password_param",
    pattern: /(?:password|pwd)=[^&\s]+/gi,
  },
  {
    name: "pem_private_key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "postgres_url",
    pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
  },
  {
    name: "mysql_url",
    pattern: /mysql:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
  },
]

export function redactString(value: string): string {
  let result = value
  for (const { pattern } of REDACTION_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, REDACTED)
  }
  return result
}

function redactRecord(
  record: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(record)) {
    out[key] =
      typeof value === "string" ? redactString(value) : value
  }
  return out
}

const STRING_EVENT_FIELDS = [
  "sessionId",
  "traceId",
  "parentId",
  "environment",
  "agentType",
  "agentVendor",
  "model",
  "goal",
  "stepName",
  "toolName",
  "mcpServerName",
  "apiEndpoint",
  "errorType",
  "errorMessageRedacted",
  "inputSchemaHash",
  "outputSchemaHash",
] as const

/**
 * Redacts secrets from event string fields and metadata/context values.
 * Disabling via privacy.redactSecrets is discouraged — secrets may leak to ingest.
 */
export function redactEvent(
  event: DoclightEvent,
  enabled: boolean,
): DoclightEvent {
  if (!enabled) return event

  const redacted = { ...event }

  for (const field of STRING_EVENT_FIELDS) {
    const value = redacted[field]
    if (typeof value === "string") {
      ;(redacted as Record<string, unknown>)[field] = redactString(value)
    }
  }

  if (redacted.metadata) {
    redacted.metadata = redactRecord(redacted.metadata)
  }
  if (redacted.context) {
    redacted.context = redactRecord(redacted.context)
  }

  return redacted
}
