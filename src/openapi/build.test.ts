import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { ingestBatchRequestSchema } from "../schema"
import {
  buildOpenApiDocument,
  EXAMPLE_INGEST_BATCH_REQUEST,
  sortKeys,
} from "./build"

const openapiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/api/openapi.json",
)

describe("openapi build", () => {
  it("generates deterministic output", () => {
    const first = sortKeys(buildOpenApiDocument())
    const second = sortKeys(buildOpenApiDocument())
    expect(first).toEqual(second)
  })

  it("example request validates against ingestBatchRequestSchema", () => {
    const result = ingestBatchRequestSchema.safeParse(
      EXAMPLE_INGEST_BATCH_REQUEST,
    )
    expect(result.success).toBe(true)
  })

  it("committed openapi.json matches generated document", () => {
    const generated = JSON.stringify(sortKeys(buildOpenApiDocument()), null, 2)
    const committed = readFileSync(openapiPath, "utf8").trimEnd()
    expect(committed).toBe(generated)
  })

  it("committed spec example round-trips through Zod", () => {
    const spec = JSON.parse(readFileSync(openapiPath, "utf8")) as {
      paths: Record<
        string,
        {
          post: {
            requestBody: {
              content: {
                "application/json": { example: unknown }
              }
            }
          }
        }
      >
    }
    const example =
      spec.paths["/v1/events/batch"]!.post.requestBody.content[
        "application/json"
      ].example
    const result = ingestBatchRequestSchema.safeParse(example)
    expect(result.success).toBe(true)
  })
})
