import type { DoclightEvent } from "./schema"

export interface WebsiteRequestInput {
  eventId: string
  timestamp: string
  /** Full or relative URL; credentials, query and fragment are stripped. */
  url: string
  httpMethod: NonNullable<DoclightEvent["httpMethod"]>
  httpStatus?: number
  durationMs?: number
  outcome: "completed" | "aborted"
  /** Claimed agent identity (e.g. a User-Agent token). Never verified here. */
  claimedAgent?: string
  agentSource?: "user_agent" | "header" | "signature" | "unknown"
  /** Referrer URL; only its origin is kept. */
  referrer?: string
  correlationId?: string
}

const MAX_ROUTE = 512
const MAX_CLAIMED = 128

/** Returns host (lowercase, with non-default port) and path only. */
export function sanitizeWebsiteUrl(
  raw: string,
): { host: string; route: string } | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return { host: url.host, route: url.pathname.slice(0, MAX_ROUTE) || "/" }
  } catch {
    return undefined
  }
}

/** Returns scheme://host[:port] of a referrer, or undefined if unusable. */
export function sanitizeReferrerOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Builds a website_request event with deterministic sanitization. Returns
 * undefined when the URL cannot be reduced to a safe host/route. The agent
 * identity is always recorded as unverified (or unknown when absent).
 */
export function buildWebsiteRequestEvent(
  input: WebsiteRequestInput,
): DoclightEvent | undefined {
  const target = sanitizeWebsiteUrl(input.url)
  if (!target) return undefined

  const claimed = input.claimedAgent?.trim().slice(0, MAX_CLAIMED)
  const referrerOrigin = input.referrer
    ? sanitizeReferrerOrigin(input.referrer)
    : undefined

  return {
    eventId: input.eventId,
    timestamp: input.timestamp,
    type: "website_request",
    source: "sdk",
    host: target.host,
    route: target.route,
    httpMethod: input.httpMethod,
    ...(input.httpStatus !== undefined && { httpStatus: input.httpStatus }),
    ...(input.durationMs !== undefined && { durationMs: input.durationMs }),
    outcome: input.outcome,
    agentIdentity: claimed
      ? {
          claimed,
          source: input.agentSource ?? "user_agent",
          verification: "unverified",
        }
      : { source: "unknown", verification: "unknown" },
    ...(referrerOrigin && { referrerOrigin }),
    ...(input.correlationId && { correlationId: input.correlationId }),
  }
}
