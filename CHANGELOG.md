## Unreleased

- Add `pnpm verify:package` packed-artifact validation and `docs/RELEASING.md`; fix repository metadata to `doclight-lab/sdk-core`.
- Add `website_request` event type, sanitizer and fixtures.
- Fix `generate:openapi` output path.
- Regenerate OpenAPI with structural website_request variants; add `Doclight.trackWebsiteRequest`, session-less `track("website_request")`, `baseUrl` for relative URLs, IP-host rejection, and redaction of nested/schema-bound website fields.
