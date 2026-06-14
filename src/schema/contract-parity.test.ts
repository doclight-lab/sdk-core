import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { doclightEventSchema, ingestBatchRequestSchema } from "./index"

const FIXTURE_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../tests/fixtures/contract_events.json",
)

interface ContractFixture {
  name: string
  schema: "event" | "batch"
  payload: Record<string, unknown>
  expect: "accept" | "reject"
}

const { fixtures } = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  fixtures: ContractFixture[]
}

describe("contract parity (Zod)", () => {
  for (const fixture of fixtures) {
    it(`${fixture.name} → ${fixture.expect}`, () => {
      const result =
        fixture.schema === "event"
          ? doclightEventSchema.safeParse(fixture.payload)
          : ingestBatchRequestSchema.safeParse(fixture.payload)

      expect(result.success).toBe(fixture.expect === "accept")
    })
  }
})
