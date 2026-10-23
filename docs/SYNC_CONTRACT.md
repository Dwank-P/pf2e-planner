# Pairing and synchronization contract (design draft)

**No endpoints are implemented in the bootstrap.** Paths below are proposed, not promises about current functionality.

## Pairing

1. Authenticated website admin creates short-lived single-use pairing code, stored hashed on the server.
2. GM enters HTTPS site URL and code inside Foundry bridge.
3. Foundry provides world ID/title, system/version, Leveler/version and a local nonce to the pairing endpoint.
4. Server validates and consumes code, creates/links campaign, issues integration UUID and tightly scoped credentials.
5. Bridge stores authorized connection state **without leaking a long-lived secret through player-readable world settings**. Support revoke/re-pair and copied-world identity conflicts.

Illustrative endpoint: `POST /api/v1/integrations/pair`.

## Catalog snapshot

Illustrative transport shape:

~~~json
{
  "schemaVersion": 1,
  "integrationId": "server-assigned-uuid",
  "snapshotId": "idempotency-key",
  "world": {"id": "abomination-vaults", "title": "Abomination Vaults"},
  "system": {"id": "pf2e", "version": "system-version"},
  "leveler": {"version": "module-version", "settings": {}},
  "packs": [],
  "items": [],
  "checksums": {}
}
~~~

A production implementation needs authenticated batching, bounded payloads, staging, integrity verification, idempotent publication and per-campaign authorization. Never trust the body-provided integration ID as proof of permission.

## Sync trigger

Authorized, active GM `ready` event triggers rules check; unchanged catalog can be skipped. Multiple logged-in GMs cannot race each other. Manual Sync Now is available. Website works from the last complete revision if Foundry is offline.

## Actor / plan operations are separate

- Explicit actor snapshot refresh (including spells and equipment), with confirmed actor-to-character link.
- Fetch/export of creation or advancement Leveler-compatible JSON.
- Explicit apply action after Foundry-side validation and optional GM confirmation.
- Never automatically apply equipment or spend currency during wishlist changes.
- Keep future plans and wishlist intact on actor refresh.

## Failures

Distinguish expired pairing code, revoked integration, conflict, incompatible schema, missing pack, incomplete staging and failed Leveler validation. Log no tokens, private actor content or passwords. Handle CORS correctly but **never substitute it for authentication**.
