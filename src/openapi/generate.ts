import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildOpenApiDocument, sortKeys } from "./build"

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/api/openapi.json",
)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(sortKeys(buildOpenApiDocument()), null, 2)}\n`)
