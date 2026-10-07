# Releasing `@doclight/core`

## Local verification

`pnpm build && pnpm verify:package` packs the exact tarball and, in a clean temp project, checks
package metadata (`repository`, `bugs`, `publishConfig`, `engines`), tarball contents (only `dist`,
`README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`), every `exports`/`main`/`module`/`types` target,
ESM `import`, CJS `require`, TypeScript types (`node16` and `bundler` resolution) and all
`tests/fixtures/contract_events.json` fixtures against the packed build. It prints the tarball SHA-256.
Pass `--tarball <file>` to verify an already-built artifact instead of packing.

## npm ownership and configuration (maintainer, one-time)

1. An npm account with 2FA owns the `@doclight` scope (org) with permission to publish `@doclight/core` (public).
2. Prefer npm Trusted Publishing (OIDC) for `doclight-lab/sdk-core`, workflow `release.yml`, environment `npm-publish`.
   Fallback: a granular, publish-only automation token scoped to `@doclight/core`, stored as the `NPM_TOKEN`
   secret of the `npm-publish` GitHub environment (required reviewers; restricted to `main`) - never a repository-wide
   secret exposed to PR jobs.
3. Confirm with `npm access list packages @doclight` / `npm view @doclight/core` (404 before first release is expected).

## First release steps

1. Contract work (issues #4 and parent coordination) complete and merged; CI green on `main`.
2. Add a changeset (`pnpm changeset`) and merge the generated "version packages" PR; CHANGELOG/version updated.
3. The single publisher job (below) runs on that exact commit: install, lint, typecheck, build, test,
   `verify:package`, then publishes **the verified tarball** (`npm publish <tarball>`), not a rebuild.
4. Record evidence on issue #5: registry version (`npm view @doclight/core version dist.integrity`), tarball
   SHA-256 from the job log, and a clean install (`npm i @doclight/core` in an empty dir + `node -e "require('@doclight/core')"`).

## Required workflow changes (trusted maintainer - protected path `.github/workflows`)

Not applied by the implementation agent. Suggested patch:

`ci.yml`: run the existing steps on a matrix `node-version: [18, 20, 22]` (declared range `>=18`; build with the
repo toolchain) and add `- run: pnpm verify:package` after `pnpm build`. Keep `permissions: contents: read`, no secrets.

`release.yml` (single publisher): keep `push: branches: [main]`; before `changesets/action`, add
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify:package`; set job
`environment: npm-publish`, `permissions: { contents: write, pull-requests: write, id-token: write }` and
publish only through that job. PR workflows must never reference `NPM_TOKEN`.
