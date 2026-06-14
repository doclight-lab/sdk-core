import type { WarnOnce } from "./errors"
import type { EventQueue } from "./queue"
import type { ResolvedDoclightConfig } from "./schema"
import { SCHEMA_VERSION } from "./schema"
import type { IngestBatchRequest } from "./schema"
import type { Transport } from "./transport"

import { DEFAULT_SDK, type SdkIdentity } from "./sdk"
const BACKOFF_BASE_MS = 250

export interface SendStats {
  sent: number
  failedSends: number
}

export class Flusher {
  private readonly queue: EventQueue
  private readonly transport: Transport
  private readonly config: ResolvedDoclightConfig
  private readonly stats: SendStats
  private readonly warnOnce: WarnOnce
  private readonly sdk: SdkIdentity
  private intervalId: ReturnType<typeof setInterval> | undefined
  private flushing = false
  private flushPromise: Promise<void> | undefined
  private stopped = false

  constructor(
    queue: EventQueue,
    transport: Transport,
    config: ResolvedDoclightConfig,
    stats: SendStats,
    warnOnce: WarnOnce,
    sdk?: SdkIdentity,
  ) {
    this.queue = queue
    this.transport = transport
    this.config = config
    this.stats = stats
    this.warnOnce = warnOnce
    this.sdk = sdk ?? DEFAULT_SDK
  }

  start(): void {
    if (this.stopped) return
    const { flushIntervalMs } = this.config.transport
    this.intervalId = setInterval(() => {
      this.scheduleFlush()
    }, flushIntervalMs)
    this.intervalId.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  scheduleFlush(): void {
    if (this.stopped || this.flushing || this.queue.length === 0) return
    void this.flushOnce()
  }

  async flushOnce(): Promise<void> {
    if (this.flushing) {
      return this.flushPromise
    }

    this.flushing = true
    this.flushPromise = this.runFlush()
    try {
      await this.flushPromise
    } finally {
      this.flushing = false
      this.flushPromise = undefined
    }
  }

  async flushWithTimeout(capMs: number): Promise<void> {
    let timer: Parameters<typeof clearTimeout>[0] | undefined
    try {
      await Promise.race([
        this.flushOnce(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, capMs)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private async runFlush(): Promise<void> {
    while (this.queue.length > 0) {
      const events = this.queue.drain(this.config.transport.batchSize)
      if (events.length === 0) break

      const batch: IngestBatchRequest = {
        schemaVersion: SCHEMA_VERSION,
        projectId: this.config.projectId,
        sdk: this.sdk,
        events,
      }

      const sent = await this.sendWithRetry(batch)
      if (!sent) {
        this.stats.failedSends += events.length
        break
      }

      this.stats.sent += events.length
    }
  }

  private async sendWithRetry(batch: IngestBatchRequest): Promise<boolean> {
    const { requestTimeoutMs, retries } = this.config.transport
    let attempt = 0

    while (true) {
      try {
        const result = await this.transport.send(batch, {
          timeoutMs: requestTimeoutMs,
        })

        if (result.ok) return true

        if (!result.retryable || attempt >= retries) {
          this.warnOnce(
            "send",
            `Batch send failed (non-retryable or retries exhausted): ${result.reason}`,
          )
          return false
        }
      } catch (err) {
        if (attempt >= retries) {
          this.warnOnce("send", `Batch send threw: ${String(err)}`)
          return false
        }
      }

      const delay = BACKOFF_BASE_MS * 2 ** attempt
      attempt++
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
