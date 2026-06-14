import type { IngestBatchRequest } from "./schema"

export type TransportResult =
  | { ok: true }
  | { ok: false; retryable: boolean; reason: string }

export interface Transport {
  send(
    batch: IngestBatchRequest,
    opts: { timeoutMs: number },
  ): Promise<TransportResult>
}

export class NoopTransport implements Transport {
  async send(): Promise<TransportResult> {
    return { ok: true }
  }
}
