export const SCHEMA_VERSION = "1" as const

/** Ingest path appended to the base endpoint URL. */
export const INGEST_BATCH_PATH = "/v1/events/batch"

/**
 * Base ingest URL (no path). Transport appends `INGEST_BATCH_PATH`.
 * Domain is a placeholder until DNS is live; zero-config SDK installs
 * target production, not localhost.
 */
export const DEFAULT_INGEST_ENDPOINT = "https://ingest.doclight.app"
