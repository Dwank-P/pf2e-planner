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
