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

### Per-type required fields

- `tool_called` requires `toolName`
- `api_called` requires `apiEndpoint`
- `error_occurred` requires `errorType`

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
