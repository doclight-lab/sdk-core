# Releasing `@doclight/core`

## Local verification

`pnpm build && pnpm verify:package` packs the exact tarball and, in a clean temp project, checks
package metadata (`repository`, `bugs`, `publishConfig`, `engines`), tarball contents (only `dist`,
`README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`), every `exports`/`main`/`module`/`types` target,
ESM `import`, CJS `require`, TypeScript types (`node16` and `bundler` resolution) and all
`tests/fixtures/contract_events.json` fixtures against the packed build. It prints the tarball SHA-256.
On success the verified tarball is kept in `.artifacts/` (gitignored); publish that exact file. Pass `--tarball <file>` to verify an already-built artifact instead (its embedded `package.json` is what gets validated).

## npm ownership and configuration (maintainer, one-time)

1. An npm account with 2FA owns the `@doclight` scope (org) with permission to publish `@doclight/core` (public).
2. Prefer npm Trusted Publishing (OIDC) for `doclight-lab/sdk-core`, workflow `release.yml`, environment `npm-publish`.
   Fallback: a granular, publish-only automation token scoped to `@doclight/core`, stored as the `NPM_TOKEN`
   secret of the `npm-publish` GitHub environment (required reviewers; restricted to `main`) - never a repository-wide
   secret exposed to PR jobs.
3. Confirm with `npm access list packages @doclight` / `npm view @doclight/core` (404 before first release is expected).

## Release Please (replaces Changesets)

Release Please (`release-please-config.json`, `.release-please-manifest.json`) is the single version/changelog/release
authority. Conventional Commit PR titles (`feat:`, `fix:`, `feat!:`) are squash-merged into `main`; Release Please
opens/updates a release PR (version, `CHANGELOG.md`, tag `vX.Y.Z`). `pnpm release:check` validates config consistency
and `node scripts/release-guard.mjs registry <version> [integrity]` prints `publish`/`skip` and fails on a conflicting
published version or registry outage (never treated as permission to overwrite).

## First release: 0.2.0

Registry history was inspected: only `0.1.0` is published (`0.1.1` in `package.json` was never published). Target is
`0.2.0`, forced by `"release-as": "0.2.0"` in the config. **After the 0.2.0 release PR merges, remove `release-as`.**
Re-check `npm view @doclight/core versions` before merging; never overwrite a published version.

1. Apply the workflow patch below (trusted maintainer) and configure npm access.
2. Merge the Release Please PR for 0.2.0 (squash). The same workflow run sees `release_created`, checks out the
   returned tag, runs install, lint, typecheck, build, test, `verify:package`, `release-guard.mjs registry`, then
   publishes the verified tarball (`npm publish .artifacts/<tarball> --access public`).
3. Record evidence on issue #5: registry version/integrity, GitHub Release URL, run URL, clean install check.
   Publish order across repos: core, then node, then express/mcp.

Failed-publish recovery: re-run the failed job, or `workflow_dispatch` with an existing tag input. The job must
verify the tag exists as a Release Please release, check out that tag (never `main`), and run identical gates; the
registry guard makes repeats idempotent.

## Required workflow changes (trusted maintainer - protected path `.github/workflows`)

Not applied by the implementation agent. Suggested `release.yml` (secret only in the publish job; `NPM_TOKEN` must
be an Actions secret/environment secret with publish rights to `@doclight/core`):

```yaml
name: Release
on:
  push: { branches: [main] }
  workflow_dispatch:
    inputs: { tag: { description: Existing release tag to recover, required: true } }
concurrency: { group: release, cancel-in-progress: false }
permissions: { contents: read }
jobs:
  release-please:
    if: github.event_name == 'push' && github.repository == 'doclight-lab/sdk-core'
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      - id: rp
        uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.PROJECTS_TOKEN }} # verify permissions; GITHUB_TOKEN PRs do not trigger CI
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
  publish:
    needs: release-please
    if: always() && (needs.release-please.outputs.release_created == 'true' || github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    environment: npm-publish
    steps:
      - uses: actions/checkout@v4
        with: { ref: "${{ needs.release-please.outputs.tag_name || inputs.tag }}" }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm, registry-url: "https://registry.npmjs.org" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm release:check && pnpm verify:package
      - name: Publish verified tarball if not already published
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }
        run: |
          V=$(node -p "require('./package.json').version")
          [ "v$V" = "${{ needs.release-please.outputs.tag_name || inputs.tag }}" ]
          D=$(node scripts/release-guard.mjs registry "$V")
          [ "$D" = skip ] || npm publish .artifacts/*.tgz --access public
```

(Maintainers: compute the tarball `sha512` integrity if you want the conflict check to compare artifacts; omit the
integrity argument to only skip on an existing version.) `ci.yml`: run on a Node matrix `[18, 20, 22]` and add
`pnpm verify:package` and `pnpm release:check` after `pnpm build`; keep `contents: read`, no secrets.

Merge integration: release PRs must carry a Conventional title (`chore(main): release 0.2.0`), be authored by a token
that triggers CI/review events, and pass the existing Codex review -> merge-ready -> Claude auto-merge flow; do not
weaken branch protection. Unverified externally: `NPM_TOKEN` presence/permissions (earlier publish failed with npm
E404, indicating scope/package permission or token authorization problems), `PROJECTS_TOKEN` permissions, branch protection.
