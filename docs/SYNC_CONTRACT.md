# Synchronization contract

See **[AUTH_AND_SYNC_V1.md](AUTH_AND_SYNC_V1.md)** for authoritative pairing, bearer token, refresh rotation, user onboarding and security details.

## Currently coded (unverified alpha)

- One-time website pairing-code creation and Foundry-world pairing.
- Reauthorization of an existing integration for another authorized GM browser/device.
- 15-minute opaque access token and rotating 14-day refresh token, stored only in GM browser IndexedDB; server stores hashes.
- Core PF2e class progression + first 1000 feat-index entries stored as one atomic **preview** snapshot, with idempotency-key collision checking.
- Website campaign preview read scoped to membership.

**Not yet implemented:** all-class third-party normalization, batch/chunk staging for full compendiums, trusted Foundry character import, Leveler plan application, campaign/credential revocation UI, multi-GM write lease, schema evolution, licensing enforcement for private packs, automatic retries/backoffs and broad SF2e testing.

## Planned full contract

Each ruleset snapshot is scoped to a unique integration UUID and separate campaign, versioned with PF2e/SF2e and Leveler versions, all allowed packs and their hashes. The GM browser can upload only data authorized by its site GM account. Server validates staged bounded batches, checksum and counts, atomically publishes complete revision, and leaves prior revision active on interruption. Actor refresh, planned choices and wishlists are independent.

No actor modification or currency deduction is allowed in response to catalog sync.

## v0.3.0 full class/feat catalog protocol

An authorized GM bridge calls `POST /api/v1/bridge/{id}/catalog-import/status` to skip redundant GM-login synchronizations. Manual Sync always uploads. Each complete import uses `/catalog-import/start` with expected Item count, selected pack keys, source versions and variant settings, then authenticated `/catalog-import/batch` calls with at most 15 selected Item documents. The server validates pack membership, UUID shape, count bounds and sanitizes descriptions; all batches remain unpublished. `/catalog-import/commit` publishes **only** if the staged row count equals expected count, atomically swaps the active revision and removes superseded entries.

The legacy `catalog-preview` endpoint remains for backwards compatibility; new websites prefer `catalog_publications` if a full revision exists. Authenticated campaign members can call `catalog-summary`, `catalog-items` and `catalog-item` while raw GM details are restricted to owner/GM. UI never downloads entire multi-thousand-item JSON in one response. Source licensing is determined by GM pack selection and membership access; future releases need finer per-pack access policies.

**Link support:** sanitized HTML stores safe `data-uuid` / `data-pf2e-uuid` references. The website resolves only synchronized Item UUIDs to browser details. It does not execute Foundry inline roll handlers or scripts.
