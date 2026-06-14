import { afterEach, describe, expect, it, vi } from "vitest"
import { Doclight, type DoclightConfig } from "./client"
import { EventQueue } from "./queue"
import type { IngestBatchRequest } from "./schema"
import { NoopTransport, type Transport, type TransportResult } from "./transport"

const SESSION = "sess_test"

function validConfig(overrides: Partial<DoclightConfig> = {}): DoclightConfig {
  return {
    apiKey: "dl_key",
    projectId: "proj_1",
    ...overrides,
  }
}

class MockTransport implements Transport {
  calls: IngestBatchRequest[] = []
  outcomes: TransportResult[] = []
  throwOnSend = false
  private callCount = 0

  async send(batch: IngestBatchRequest): Promise<TransportResult> {
    if (this.throwOnSend) throw new Error("transport threw")
    this.calls.push(batch)
    const outcome = this.outcomes[this.callCount] ?? { ok: true }
    this.callCount++
    return outcome
  }

  get sendCount(): number {
    return this.callCount
  }

  resetCallCount(): void {
    this.callCount = 0
  }
}

function trackN(client: Doclight, n: number, sessionId = SESSION): void {
  for (let i = 0; i < n; i++) {
    client.track("session_started", { sessionId, goal: `event-${i}` })
  }
}

describe("Doclight runtime", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("track() returns synchronously without sending before flush", () => {
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 50, flushIntervalMs: 60_000 },
      }),
    )

    const result = client.track("session_started", { sessionId: SESSION })
    expect(result).toBeUndefined()
    expect(transport.calls).toHaveLength(0)

    void client.shutdown()
  })

  it("flushes exactly one batch of 50 when batchSize is reached", async () => {
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 50, flushIntervalMs: 60_000 },
      }),
    )

    trackN(client, 50)
    await vi.waitFor(() => expect(transport.calls).toHaveLength(1))
    expect(transport.calls[0]!.events).toHaveLength(50)

    await client.shutdown()
  })

  it("flushes on interval with fake timers", async () => {
    vi.useFakeTimers()
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 500, flushIntervalMs: 3000 },
      }),
    )

    client.track("session_started", { sessionId: SESSION })
    expect(transport.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(transport.calls).toHaveLength(1))

    await client.shutdown()
  })

  it("drop_oldest keeps newest events when queue overflows", async () => {
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: {
          batchSize: 100,
          maxQueueSize: 10,
          dropPolicy: "drop_oldest",
          flushIntervalMs: 60_000,
        },
      }),
    )

    trackN(client, 15)
    expect(client.getStats().droppedQueueFull).toBe(5)

    await client.flush()
    expect(transport.calls[0]!.events).toHaveLength(10)
    expect(transport.calls[0]!.events[9]!.goal).toBe("event-14")

    await client.shutdown()
  })

  it("drop_newest keeps oldest events when queue overflows", async () => {
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: {
          batchSize: 100,
          maxQueueSize: 10,
          dropPolicy: "drop_newest",
          flushIntervalMs: 60_000,
        },
      }),
    )

    trackN(client, 15)
    expect(client.getStats().droppedQueueFull).toBe(5)

    await client.flush()
    expect(transport.calls[0]!.events).toHaveLength(10)
    expect(transport.calls[0]!.events[0]!.goal).toBe("event-0")

    await client.shutdown()
  })

  it("retries retryable failures with exponential backoff then drops batch", async () => {
    vi.useFakeTimers()
    const transport = new MockTransport()
    transport.outcomes = Array.from({ length: 4 }, () => ({
      ok: false as const,
      retryable: true,
      reason: "503",
    }))

    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: {
          batchSize: 50,
          flushIntervalMs: 60_000,
          retries: 3,
        },
      }),
    )

    trackN(client, 1)
    const flushPromise = client.flush()

    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromise

    expect(transport.sendCount).toBe(4)
    expect(client.getStats().failedSends).toBe(1)

    transport.resetCallCount()
    transport.outcomes = []
    client.track("session_started", { sessionId: SESSION })
    await client.flush()
    expect(transport.sendCount).toBe(1)

    await client.shutdown()
  })

  it("does not retry non-retryable failures", async () => {
    const transport = new MockTransport()
    transport.outcomes = [{ ok: false, retryable: false, reason: "400" }]

    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 50, flushIntervalMs: 60_000, retries: 3 },
      }),
    )

    trackN(client, 1)
    await client.flush()

    expect(transport.sendCount).toBe(1)
    expect(client.getStats().failedSends).toBe(1)

    await client.shutdown()
  })

  it("catches throwing transport without propagating", async () => {
    const transport = new MockTransport()
    transport.throwOnSend = true

    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 50, flushIntervalMs: 60_000, retries: 1 },
      }),
    )

    trackN(client, 1)
    await expect(client.flush()).resolves.toBeUndefined()
    expect(client.getStats().failedSends).toBe(1)

    await client.shutdown()
  })

  it("disables client on invalid config in non-strict mode", () => {
    const client = new Doclight(
      validConfig({ apiKey: "" } as unknown as DoclightConfig),
    )
    expect(() =>
      client.track("session_started", { sessionId: SESSION }),
    ).not.toThrow()
    expect(client.getStats().enqueued).toBe(0)
  })

  it("throws on invalid config in strict mode", () => {
    expect(
      () =>
        new Doclight(
          validConfig({ apiKey: "", strict: true } as unknown as DoclightConfig),
        ),
    ).toThrow()
  })

  it("throws on invalid event in strict mode", () => {
    const client = new Doclight(validConfig({ strict: true }))
    expect(() =>
      client.track("tool_called", { sessionId: SESSION }),
    ).toThrow()
  })

  it("strips input/output/prompt top-level fields via schema", async () => {
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 1, flushIntervalMs: 60_000 },
      }),
    )

    client.track("session_started", {
      sessionId: SESSION,
      input: "secret input",
      output: "secret output",
      prompt: "secret prompt",
    } as never)

    await client.flush()
    const event = transport.calls[0]!.events[0]!
    expect(event).not.toHaveProperty("input")
    expect(event).not.toHaveProperty("output")
    expect(event).not.toHaveProperty("prompt")

    await client.shutdown()
  })

  it("shutdown flushes pending events and is idempotent", async () => {
    vi.useFakeTimers()
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 500, flushIntervalMs: 60_000 },
      }),
    )

    trackN(client, 3)
    await client.shutdown()
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]!.events).toHaveLength(3)

    const t0 = Date.now()
    await client.shutdown()
    expect(Date.now() - t0).toBeLessThan(50)

    await client.shutdown()
  })

  it("clears flush interval timer on shutdown", async () => {
    vi.useFakeTimers()
    const transport = new MockTransport()
    const client = new Doclight(
      validConfig({
        sender: transport,
        transport: { batchSize: 500, flushIntervalMs: 3000 },
      }),
    )

    client.track("session_started", { sessionId: SESSION })
    await client.shutdown()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("10k track() calls complete in under 1 second with NoopTransport", () => {
    const client = new Doclight(
      validConfig({
        sender: new NoopTransport(),
        transport: { batchSize: 10_000, flushIntervalMs: 60_000, maxQueueSize: 20_000 },
      }),
    )

    const start = performance.now()
    trackN(client, 10_000)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(client.getStats().enqueued).toBe(10_000)
  })
})

describe("EventQueue", () => {
  const baseEvent = {
    eventId: "e1",
    timestamp: "2026-06-11T12:00:00.000Z",
    type: "session_started" as const,
    sessionId: "s1",
  }

  it("drop_oldest evicts head", () => {
    const q = new EventQueue(2, "drop_oldest")
    q.enqueue({ ...baseEvent, eventId: "e1" })
    q.enqueue({ ...baseEvent, eventId: "e2" })
    q.enqueue({ ...baseEvent, eventId: "e3" })
    expect(q.length).toBe(2)
    expect(q.stats.droppedQueueFull).toBe(1)
    const drained = q.drain(10)
    expect(drained.map((e) => e.eventId)).toEqual(["e2", "e3"])
  })

  it("drop_newest rejects incoming", () => {
    const q = new EventQueue(2, "drop_newest")
    q.enqueue({ ...baseEvent, eventId: "e1" })
    q.enqueue({ ...baseEvent, eventId: "e2" })
    q.enqueue({ ...baseEvent, eventId: "e3" })
    expect(q.length).toBe(2)
    expect(q.stats.droppedQueueFull).toBe(1)
    const drained = q.drain(10)
    expect(drained.map((e) => e.eventId)).toEqual(["e1", "e2"])
  })
})
