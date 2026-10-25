# Repository instructions

- Package manager: pnpm. Validate with `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify:package`, `pnpm release:check`, `node --test .github/scripts/*.test.cjs`.
- PR titles must be Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `feat!:`). PRs are squash-merged; the title becomes the commit Release Please reads.
- Releases are managed by Release Please only (see `docs/RELEASING.md`). Never edit the version or release entries in `CHANGELOG.md` by hand, and never publish from PRs.
- Do not edit `.github/workflows` or other protected automation paths; report required changes as a maintainer blocker.
