import {
  doclightEventSchema,
  websiteHostSchema,
  type DoclightEvent,
} from "./schema"

interface WebsiteRequestInputCommon {
  eventId: string
  timestamp: string
  /**
   * Absolute URL, or a relative URL (e.g. `/docs?x=1`) together with
   * `baseUrl`. Credentials, query and fragment are stripped.
   */
  url: string
  /** Absolute base (e.g. `https://example.com`) for relative `url` values. */
  baseUrl?: string
  httpMethod: NonNullable<DoclightEvent["httpMethod"]>
  durationMs?: number
  /** Claimed agent identity (e.g. a User-Agent token). Never verified here. */
  claimedAgent?: string
  agentSource?: "user_agent" | "header" | "signature" | "unknown"
  /** Referrer URL; only its origin is kept. */
  referrer?: string
  correlationId?: string
}

/** A completed request must carry its HTTP status; an aborted one may not. */
export type WebsiteRequestInput = WebsiteRequestInputCommon &
  (
    | { outcome: "completed"; httpStatus: number }
    | { outcome: "aborted"; httpStatus?: number }
  )

const MAX_ROUTE = 512
const MAX_CLAIMED = 128

/** Returns host (lowercase, with non-default port) and path only. */
export function sanitizeWebsiteUrl(
  raw: string,
  base?: string,
): { host: string; route: string } | undefined {
  try {
    const url = new URL(raw, base)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    // Raw IP literals (IPv4/IPv6) and other invalid hosts are not allowed.
    if (!websiteHostSchema.safeParse(url.host).success) return undefined
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
  const target = sanitizeWebsiteUrl(input.url, input.baseUrl)
  if (!target) return undefined

  const claimed = input.claimedAgent?.trim().slice(0, MAX_CLAIMED)
  const referrerOrigin = input.referrer
    ? sanitizeReferrerOrigin(input.referrer)
    : undefined

  const event: DoclightEvent = {
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

  // Never hand back an event the ingest contract would reject.
  const parsed = doclightEventSchema.safeParse(event)
  return parsed.success ? parsed.data : undefined
}
