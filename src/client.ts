import { createWarnOnce, type WarnOnce } from "./errors"
import { Flusher } from "./flusher"
import { EventQueue } from "./queue"
import { redactEvent } from "./redact"
import {
  doclightConfigSchema,
  doclightEventSchema,
  type DoclightConfigInput,
  type DoclightEvent,
  type DoclightEventType,
  type ResolvedDoclightConfig,
} from "./schema"

type EventStatus = "success" | "failed" | "timeout" | "cancelled"
import type { SdkIdentity } from "./sdk"
import { NoopTransport, type Transport } from "./transport"

export type { SdkIdentity } from "./sdk"

export type DoclightConfig = DoclightConfigInput & {
  /** Pluggable send implementation; outside Zod validation. */
  sender?: Transport
  /** SDK identity in batch envelope; defaults to @doclight/core. */
  sdk?: SdkIdentity
}

export interface DoclightStats {
  enqueued: number
  sent: number
  droppedQueueFull: number
  droppedInvalid: number
  failedSends: number
}

type TrackFields = Omit<
  Partial<DoclightEvent>,
  "eventId" | "timestamp" | "type" | "source" | "environment"
> & { sessionId: string }

export interface TrackToolCallFields {
  sessionId: string
  toolName: string
  status: EventStatus
  durationMs: number
  [key: string]: string | number | boolean | undefined
}

function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export class Doclight {
  private readonly strict: boolean
  private readonly disabled: boolean
  private readonly config: ResolvedDoclightConfig | undefined
  private readonly queue: EventQueue | undefined
  private readonly flusher: Flusher | undefined
  private readonly warnOnce: WarnOnce
  private readonly stats: DoclightStats = {
    enqueued: 0,
    sent: 0,
    droppedQueueFull: 0,
    droppedInvalid: 0,
    failedSends: 0,
  }
  private shutDown = false
  private shutdownPromise: Promise<void> | undefined

  constructor(config: DoclightConfig) {
    const { sender, sdk, ...schemaInput } = config
    const parsed = doclightConfigSchema.safeParse(schemaInput)
    this.warnOnce = createWarnOnce(
      parsed.success ? parsed.data.debug : Boolean(schemaInput.debug),
    )
    this.strict = parsed.success
      ? parsed.data.strict
      : Boolean(schemaInput.strict)

    if (!parsed.success) {
      if (this.strict) {
        throw parsed.error
      }
      this.warnOnce("config", "Invalid config — client disabled")
      this.disabled = true
      return
    }

    const resolved = parsed.data
    this.config = resolved
    this.disabled = !resolved.enabled

    if (this.disabled) return

    const transport = sender ?? new NoopTransport()
    const queue = new EventQueue(
      resolved.transport.maxQueueSize,
      resolved.transport.dropPolicy,
    )
    this.queue = queue
    this.flusher = new Flusher(
      queue,
      transport,
      resolved,
      this.stats,
      this.warnOnce,
      sdk,
    )
    this.flusher.start()
  }

  track(type: DoclightEventType, fields: TrackFields): void {
    if (this.disabled || this.shutDown) return

    try {
      const raw: Record<string, unknown> = {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        type,
        source: "sdk" as const,
        environment: this.config!.environment ?? "production",
        ...fields,
      }

      if (!this.config!.privacy.captureContext) {
        delete raw.context
      }

      const parsed = doclightEventSchema.safeParse(raw)
      if (!parsed.success) {
        if (this.strict) throw parsed.error
        this.stats.droppedInvalid++
        return
      }

      const event = redactEvent(
        parsed.data,
        this.config!.privacy.redactSecrets,
      )

      this.queue!.enqueue(event)
      this.stats.enqueued++
      this.stats.droppedQueueFull = this.queue!.stats.droppedQueueFull

      if (this.queue!.length >= this.config!.transport.batchSize) {
        this.flusher!.scheduleFlush()
      }
    } catch (err) {
      if (this.strict) throw err
      this.warnOnce("track", `track() failed: ${String(err)}`)
    }
  }

  startSession(
    goal?: string,
    meta?: Record<string, string | number | boolean>,
  ): string {
    const sessionId = randomUUID()
    this.track("session_started", {
      sessionId,
      ...(goal !== undefined ? { goal } : {}),
      ...(meta !== undefined ? { metadata: meta } : {}),
    })
    return sessionId
  }

  endSession(sessionId: string, status: EventStatus): void {
    this.track("session_completed", { sessionId, status })
  }

  trackToolCall(fields: TrackToolCallFields): void {
    const { sessionId, toolName, status, durationMs, ...rest } = fields
    this.track("tool_called", {
      sessionId,
      toolName,
      status,
      durationMs,
      ...rest,
    })
  }

  async flush(): Promise<void> {
    if (this.disabled || !this.flusher) return
    try {
      await this.flusher.flushOnce()
    } catch (err) {
      if (this.strict) throw err
      this.warnOnce("flush", `flush() failed: ${String(err)}`)
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    if (this.disabled || !this.flusher) {
      this.shutDown = true
      return
    }

    this.shutdownPromise = (async () => {
      this.shutDown = true
      this.flusher!.stop()
      const capMs = this.config!.transport.requestTimeoutMs * 2
      try {
        await this.flusher!.flushWithTimeout(capMs)
      } catch (err) {
        if (this.strict) throw err
        this.warnOnce("shutdown", `shutdown flush failed: ${String(err)}`)
      }
    })()

    return this.shutdownPromise
  }

  getStats(): DoclightStats {
    if (this.queue) {
      this.stats.droppedQueueFull = this.queue.stats.droppedQueueFull
    }
    return { ...this.stats }
  }
}
