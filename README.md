# @doclight/core

`@doclight/core` is the foundation of the Doclight Agent Observability SDK: it defines the versioned event schema, the async in-memory queue, the flusher, and the transport interface that wires them together. It has no Node.js-specific dependencies and no concrete HTTP implementation — it is designed to be embedded in environment-specific packages.

**Most customers should install `@doclight/node` instead**, which wires `@doclight/core` with an HTTP transport and process lifecycle hooks. Use `@doclight/core` directly only if you are building a custom transport or framework adapter.

## Usage

```ts
import { Doclight } from "@doclight/core"

const client = new Doclight({
  apiKey: process.env.DOCLIGHT_API_KEY!,
  projectId: "proj_abc",
})

const sessionId = client.startSession("fix checkout bug")
client.trackToolCall({
  sessionId,
  toolName: "grep",
  status: "success",
  durationMs: 12,
})
client.endSession(sessionId, "success")

await client.shutdown()
```

## Wire format

All field names use **camelCase** on the wire.

## Event model

Every event requires `eventId`, `timestamp` (ISO 8601), `type`, and `sessionId`. Additional fields (agent metadata, tool names, error info, etc.) are optional and shared across event types.

### Event type reference

| Event type | Description |
| --- | --- |
| `session_started` | Agent session begins |
| `session_completed` | Agent session ends with outcome |
| `agent_detected` | Agent identity resolved |
| `step_started` | Reasoning step begins |
| `step_completed` | Reasoning step ends |
| `tool_listed` | Available tools enumerated |
| `tool_called` | Tool invoked; requires `toolName` |
| `resource_read` | MCP resource fetched |
| `prompt_used` | Prompt template rendered |
| `api_called` | Outbound HTTP call; requires `apiEndpoint` |
| `error_occurred` | Error captured; requires `errorType` |
| `retry_attempted` | Retry on failure |
| `auth_failed` | Authentication rejected |
| `schema_validation_failed` | Schema validation error |
| `rate_limited` | Rate limit hit |
| `timeout_occurred` | Operation timed out |
| `website_request` | Inbound website request; no `sessionId` or agent task required |

### Per-type required fields

- `tool_called` requires `toolName`
- `api_called` requires `apiEndpoint`
- `error_occurred` requires `errorType`

### Website request events

`website_request` is an additive event type for website telemetry (same `schemaVersion`; existing tool/session events are unchanged).

| Field | Rule |
| --- | --- |
| `eventId`, `timestamp` | Required; timestamp is an ISO-8601 UTC datetime |
| `host` | Required; lowercase hostname with optional port, max 260 chars, IP literals rejected |
| `route` | Required; path only, starts with `/`, max 512 chars, no query (`?`), fragment (`#`), whitespace or control characters |
| `httpMethod` | Required |
| `httpStatus` | Integer 100–599; required when `outcome` is `completed` |
| `durationMs` | Non-negative integer, at most 24h |
| `outcome` | Required: `completed` or `aborted` |
| `agentIdentity` | Optional evidence: `claimed` (max 128), `source` (`user_agent`/`header`/`signature`/`unknown`), `verification` (`unverified`/`verified`/`unknown`). A claimed identity is never verified identity |
| `referrerOrigin` | Optional; `scheme://host[:port]` only |
| `correlationId` | Optional; supplied by the caller, `[A-Za-z0-9._:-]`, max 128 |

**Migration note:** `sessionId` is now optional in the event type, but still required (by validation) for every type except `website_request`. TypeScript consumers reading `event.sessionId` as `string` must handle `undefined`.

Use `buildWebsiteRequestEvent()` / `sanitizeWebsiteUrl()` to strip credentials, query strings and fragments and reduce referrers to their origin before sending. Request bodies, cookies, raw IPs and prompts are not part of this contract. Canonical fixtures live in `tests/fixtures/contract_events.json` (`website_request_*`) for backend parity tests.

`metadata` and `context` are string-keyed records (values: string, number, or boolean) with at most 50 keys and 1 KB serialized size.

## Batch ingest

`schemaVersion` lives on the **batch envelope**, not on individual events, so per-event payloads stay lean:

```ts
{
  schemaVersion: "1",
  projectId: "...",
  sdk: { name: "...", version: "..." },
  events: [/* 1–500 events */]
}
```

## Schema versioning

- `SCHEMA_VERSION` is `"1"` today.
- Additive changes (new optional fields, new event types) stay within the current `schemaVersion`.
- Breaking changes (removing fields, changing types, tightening validation) require bumping `SCHEMA_VERSION`.

## Privacy defaults

**Raw prompt, input, and output payloads are never captured by default.**

| Field | Default | Effect |
| --- | --- | --- |
| `privacy.captureInputs` | `false` | Tool input arguments are never sent |
| `privacy.captureOutputs` | `false` | Tool output content is never sent |
| `privacy.captureContext` | `true` | Structured context fields are sent |
| `privacy.redactSecrets` | `true` | Common secret patterns are redacted |

## Config defaults

`doclightConfigSchema.parse({ apiKey, projectId })` yields a fully resolved config:

| Field | Default |
| --- | --- |
| `endpoint` | `https://ingest.doclight.app` |
| `transport.mode` | `"async"` |
| `transport.batchSize` | `50` |
| `transport.flushIntervalMs` | `3000` |
| `transport.maxQueueSize` | `5000` |
| `transport.requestTimeoutMs` | `500` |
| `transport.dropPolicy` | `"drop_oldest"` |
| `transport.retries` | `3` |
| `debug` | `false` |
| `enabled` | `true` |
| `strict` | `false` |

`environment` defaults to `"production"` at the client level. Pass a custom `sender` transport implementation on the config object; defaults to `NoopTransport`. Set `strict: true` during development to throw on invalid config or events.

---

[Full documentation →](https://doclight.app/docs)
