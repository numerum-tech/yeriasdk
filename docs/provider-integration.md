# Provider integration — moved

This guide now lives in [`specs/provider-integration.md`](../specs/provider-integration.md).

`specs/` is the published documentation set: `yeria-public` mirrors it into
`public/docs/specs/` (see `scripts/sync-sdk-specs.mjs`, run on every
`prestart` / `prebuild`, and `clone.sh`) and renders it at `/docs`. Anything
kept here would never reach providers, and would drift.

Edit the copy under `specs/`.
