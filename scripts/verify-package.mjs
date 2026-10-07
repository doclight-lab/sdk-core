#!/usr/bin/env node
// Packs the package and validates the exact tarball in a clean consumer project:
// metadata, exports/files, ESM import, CJS require, TypeScript types, schema fixtures.
// Usage: node scripts/verify-package.mjs [--tarball path/to/file.tgz]
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
const fail = (msg) => {
  console.error(`verify-package: FAIL - ${msg}`)
  process.exit(1)
}
const assert = (cond, msg) => cond || fail(msg)

// 2. Pack the exact artifact
const work = mkdtempSync(join(tmpdir(), "doclight-verify-"))
try {
  const argIdx = process.argv.indexOf("--tarball")
  let tarball
  if (argIdx > -1) {
    tarball = resolve(process.argv[argIdx + 1])
  } else {
    const out = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work], root))
    tarball = join(work, out[0].filename)
  }
  assert(existsSync(tarball), "tarball not found")
  // Validate the manifest shipped inside the artifact, not the workspace one.
  const extracted = join(work, "extracted")
  mkdirSync(extracted)
  run("tar", ["-xzf", tarball, "-C", extracted, "package/package.json"], root)
  const pkg = JSON.parse(readFileSync(join(extracted, "package/package.json"), "utf8"))
  // 1. Metadata (from the tarball)
  assert(pkg.name === "@doclight/core", "unexpected package name")
  assert(/^\d+\.\d+\.\d+/.test(pkg.version), "version is not semver")
  assert(
    pkg.repository?.url === "https://github.com/doclight-lab/sdk-core",
    `repository.url must be https://github.com/doclight-lab/sdk-core (got ${pkg.repository?.url})`,
  )
  assert(String(pkg.bugs).startsWith("https://github.com/doclight-lab/sdk-core"), "bugs URL mismatch")
  assert(pkg.publishConfig?.access === "public", "publishConfig.access must be public")
  assert(pkg.license, "license missing")
  assert(pkg.engines?.node, "engines.node missing")

  const sha = createHash("sha256").update(readFileSync(tarball)).digest("hex")
  console.log(`tarball: ${tarball}\nsha256: ${sha}`)

  const listing = run("tar", ["-tzf", tarball], root).split("\n").filter(Boolean)
  for (const f of ["package/package.json", "package/README.md", "package/CHANGELOG.md", "package/LICENSE"])
    assert(listing.includes(f), `tarball missing ${f}`)
  const targets = [pkg.main, pkg.module, pkg.types, pkg.exports["."].import, pkg.exports["."].require, pkg.exports["."].types]
  for (const t of new Set(targets))
    assert(listing.includes(`package/${t.replace(/^\.\//, "")}`), `tarball missing export target ${t}`)
  const stray = listing.filter(
    (f) => !/^package\/(package\.json|README\.md|CHANGELOG\.md|LICENSE|dist\/.*)$/.test(f),
  )
  assert(stray.length === 0, `unexpected files in tarball: ${stray.join(", ")}`)

  // 3. Clean consumer project
  const app = join(work, "consumer")
  mkdirSync(app)
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }))
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball, "typescript@5", "@types/node@22"], app)
  const fixtures = readFileSync(join(root, "tests/fixtures/contract_events.json"), "utf8")
  writeFileSync(join(app, "fixtures.json"), fixtures)

  // ESM
  writeFileSync(
    join(app, "esm.mjs"),
    `import { readFileSync } from "node:fs"
import * as core from "@doclight/core"
const { fixtures } = JSON.parse(readFileSync("./fixtures.json", "utf8"))
if (typeof core.Doclight !== "function") throw new Error("Doclight export missing (esm)")
let n = 0
for (const f of fixtures) {
  const r = (f.schema === "event" ? core.doclightEventSchema : core.ingestBatchRequestSchema).safeParse(f.payload)
  if (r.success !== (f.expect === "accept")) throw new Error("fixture mismatch (esm): " + f.name)
  n++
}
console.log("esm ok, fixtures:", n)
`,
  )
  // CJS
  writeFileSync(
    join(app, "cjs.cjs"),
    `const { readFileSync } = require("node:fs")
const core = require("@doclight/core")
const { fixtures } = JSON.parse(readFileSync("./fixtures.json", "utf8"))
if (typeof core.Doclight !== "function") throw new Error("Doclight export missing (cjs)")
let n = 0
for (const f of fixtures) {
  const r = (f.schema === "event" ? core.doclightEventSchema : core.ingestBatchRequestSchema).safeParse(f.payload)
  if (r.success !== (f.expect === "accept")) throw new Error("fixture mismatch (cjs): " + f.name)
  n++
}
console.log("cjs ok, fixtures:", n)
`,
  )
  // Types (both module resolutions)
  writeFileSync(
    join(app, "types.ts"),
    `import { Doclight, NoopTransport, type DoclightConfig, type Transport } from "@doclight/core"
const t: Transport = new NoopTransport()
export type Cfg = DoclightConfig
export const make = (c: DoclightConfig) => new Doclight(c)
export { t }
`,
  )
  for (const [name, mod, res] of [
    ["node16-esm", "node16", "node16"],
    ["bundler", "esnext", "bundler"],
  ]) {
    run(
      join(app, "node_modules/.bin/tsc"),
      ["--noEmit", "--strict", "--skipLibCheck", "false", "--target", "es2022", "--module", mod, "--moduleResolution", res, "--types", "node", "types.ts"],
      app,
    )
    console.log(`types ok (${name})`)
  }
  process.stdout.write(run("node", ["esm.mjs"], app))
  process.stdout.write(run("node", ["cjs.cjs"], app))
  // Keep the verified tarball where the release step can publish it.
  if (!process.argv.includes("--tarball")) {
    const keepDir = join(root, ".artifacts")
    mkdirSync(keepDir, { recursive: true })
    const kept = join(keepDir, tarball.split(/[\\/]/).pop())
    copyFileSync(tarball, kept)
    console.log(`verified tarball kept at: ${kept}`)
  }
  console.log("verify-package: OK")
} finally {
  rmSync(work, { recursive: true, force: true })
}
