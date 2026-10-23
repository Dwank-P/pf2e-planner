# Authentication, pairing and synchronization — design v1

Status: **approved engineering proposal for initial implementation**, 23 October 2026. Not all endpoints are implemented. Review the implementation checklist and threat model before any internet deployment.

## 1. Trust boundaries and invariants

The planner is one HTTPS web service, one per-user web account database and any number of Foundry worlds running the bridge. The Foundry module runs as **JavaScript in a GM's browser**, not as privileged trusted server code. Module code, world settings and Foundry-side GM flags are not cryptographic proof of authorization. The website must always authorize on its own database.

1. The **PF2e/SF2e system** is canonical for class and item details; Leveler provides progression adjuncts/dual-class and import/application, not duplicated official class definitions.
2. An explicit website GM/admin authorizes each pairing. A high-entropy pairing code is **one use and short-lived**. Codes are not durable integration credentials.
3. A paired integration belongs to **one** campaign; website controls roles and readable content. The origin and integration ID are *routing* information, not secrets.
4. Browser sync access is **delegated to one website GM account**, not a permanent shared world secret. No refresh or access token may ever be saved in `game.settings` world scope, journal entries, exported JSON, git, chats or query strings.
5. Use short-lived access tokens (15 minutes) plus opaque rotating refresh tokens (maximum 14 days), each stored only in a GM browser's origin-local IndexedDB partitioned by website URL, integration UUID and Foundry user ID. Tokens are never synchronized to non-GMs or other devices. Store only **hashes** in the website database.
6. Refresh-token rotation is atomic: a refresh token is consumed exactly once, and reuse revokes the affected credential family. A successful GM browser connection can refresh automatically; if its refresh token expires, is revoked or IndexedDB is cleared, GM must reauthorize. No sync without connected authorized GM.
7. Anyone who can execute arbitrary JavaScript in the GM's browser (malicious module, browser extension or cross-site scripting on Foundry origin) can act with that GM browser's credentials. Document as an unavoidable residual risk for browser-mediated integration; trusted-client hosting and module audit remain necessary. A true unattended securely held world-level secret would require a separate trusted server component.
8. No public catalogs, roster or characters without authorization. Never trust an integration's claimed `worldId`, `user.isGM` or `Origin` alone to grant web access.
9. Sync atomically publishes complete revisions, never partial/failed uploads; keeps prior good catalog for offline viewing.

## 2. Global accounts and campaign memberships

**Global user** is unique across the planner server. **Membership** is unique by (`campaign_id`, `user_id`) and has `gm` or `player` role. Being a GM in campaign A does not grant access to campaign B. The **site owner** may access and administer all campaigns. A new campaign's pairing author automatically becomes its GM.

GM website UI: **Campaign → Players → Add Player** opens a searchable existing-user picker and a **Create New Player** option.

### Existing user

- Search the global directory by display name or username; require GM authorization to search.
- Show only minimal directory fields (name + handle/ID to disambiguate duplicates), not passwords, email or memberships to which the GM has no permission.
- Selecting a user adds membership to this campaign; never creates a duplicate account or asks for another password.
- If user is already a member, indicate membership exists instead of creating another.
- Existing users log in with their same username and password, and can switch among authorized campaigns.

### New user

- GM enters a **display name**. Website reserves a global user record in `pending` state and adds that account to the campaign as a player.
- Website generates a **single-use 192-bit+ random invitation code** (32 random bytes, base64url, ~43 characters). Display the code and an optional join URL **once**, for GM to share over a private channel. The DB holds SHA-256 of the random code, never the code.
- Expire unredeemed code after 24 hours. Only explicit POST redemption consumes it; viewing the join form never consumes it (protects against messaging link scanners).
- User opens `/join`, enters code and selects a unique login username and password. Username is case-normalized, immutable initially; display name can be changed later. Password min 12, max 256 characters and hashed with Argon2id (memory at least 19 MiB, t>=2, p>=1, with unique per-password salt).
- Atomic DB transaction marks invitation used, activates the pending user, stores password verifier and creates a new server-side browser session.
- If token expires/lost, GM may **reissue** and invalidate old pending code. No password ever sent to GM.
- For this email-less design, forgotten password recovery requires an authorized owner-issued reset code. There is no email-based account verification. Do not automatically merge accounts with matching display names.
- New user can also be added to more campaigns later without new credentials.

### Sessions and login

- Username + password login over HTTPS; reject wrong credentials with generic response and rate limits (per source IP + username plus account thresholds).
- Opaque 256-bit random session cookie: `__Host-planner_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, TTL 30 days; hashed token in DB, revocable on logout.
- Require same-origin `Origin` and JSON Content-Type for state-changing cookie-authenticated API operations; no cross-origin credentialed CORS for web sessions. Return CSRF-safe error for missing/mismatched `Origin` in browsers. When behind a reverse proxy, use a **fixed configured `PUBLIC_ORIGIN`**, never build allowed origin from user-supplied Host headers.
- Owner initializes first account via a strong out-of-band `BOOTSTRAP_TOKEN` environment secret; the setup route rejects requests after initialization. No hardcoded or sample admin credentials.
- Scope campaign searches, roster, actors, plans and content in SQL/authorization logic; player roles never inherit server admin privileges.

## 3. Pairing authorization — GM browser

```text
Admin/GM logged in at web             Foundry v14 GM (browser)
       |                                          |
       | POST /api/v1/pairing-codes              |
       |  server generates 256-bit secret        |
       |  expires after 10 min                   |
       | ------- code shown once --------------> |
       |                                   GM enters base HTTPS URL + code
       |                     POST /api/v1/bridge/pair (no cookies)
       | <----------------------------------------|
       | hash-match code, consume exactly once   |
       | create campaign if first pairing        |
       | bind integration UUID + origin + GM uid |
       | ---------------------------------------->|
       | response: integrationId,                 |
       | access token (15m),                      |
       | refresh token (14d)                      |
       |                                          |
       |                           save tokens only in GM browser IndexedDB
       |                           save URL + integration ID as non-secret
       |                           Foundry client/world setting
```

**Pairing body**: `{code, worldId, worldTitle, systemId, systemVersion, levelerVersion, clientNonce}`. Never accept a caller-supplied `campaignId` to gain access. Pairing codes are scoped to issuing web user. The server records the browser's concrete HTTPS Origin and binds token use to that Origin, if present. Browser requests to the bridge API use `Authorization: Bearer <opaque access token>`.

If a cloned Foundry world inherits a stored integration UUID and/or another user attempts to pair it, require explicit website-owner reconciliation before replacing the prior binding. During prototype, refuse to automatically merge on world ID alone.

**Foundry module settings**: `websiteUrl` and `integrationId` are non-secret and may be world-scoped; `accessToken`, `refreshToken` and pairing code must not be world-scoped or logged. The GM's browser local storage should be partitioned by site origin, integration, world installation identity and Foundry user ID. Never infer user identity by display name.

### Refresh / revocation

- `POST /api/v1/bridge/{integrationId}/refresh` authenticated by refresh token in JSON body (no web cookies), rotates it in a single transaction and supplies a fresh access token; rejects reuse and revokes token family.
- Successful GM `ready` hook finds per-GM IndexedDB credentials and refreshes if needed. Otherwise show **Authorize Planner** rather than an unauthenticated automatic POST.
- A session in a browser proves possession, not the current GM status in Foundry; for web authorization the associated account must remain GM on the campaign. Site owner can revoke GM role, pairing or device at any time, invalidating both token types.
- The server may have several GM devices with **separate credential families**; do not share one refresh token across browsers.
- `POST /api/v1/bridge/{integrationId}/revoke` (owner/GM web session) revokes one device or all devices; re-pair requires new single-use code.
- Access token expiration is short and introspected against DB revocation on every bridge request; no long-lived self-issued JWTs or static API keys.

## 4. Cross-origin policy

Foundry's browser and web server normally have different origins. Allow requests from registered Foundry origin **only** to `/api/v1/bridge/*`, with `Authorization, Content-Type` headers, no cross-origin cookies. Pairing preflight may accept candidate HTTPS origins because the one-time high-entropy code is the credential; successful pairing fixes an origin. Actual pair handler rejects opaque/null Origins and requires HTTPS (localhost-only exception for local development with explicit opt-in). Match stored origin on refresh/sync and check server-side token/campaign role. Never rely on browser CORS to protect against a non-browser attacker.

Origin changes (reverse-proxy/domain migration) require new explicit authorization; don't silently widen allowlist.

## 5. Content synchronization

Only after successful pairing, on authorized GM login (`Hooks.once('ready')`) or manual **Sync Now**:

1. Read system ID/version, world metadata, core PF2e system variant settings, Leveler version/settings, selected configured compendium pack metadata and source hashes. Detect active GMs using Foundry `game.users.activeGM` or election/lease; the web service still enforces one concurrent uploader.
2. For first vertical slice export bounded normalized `pf2e.classes` class progression and a feat index (name, UUID, type, slug, level, rarity, traits). Avoid actor/secret/settings bulk export and premium data by default. Custom packs require GM content selection and access rules.
3. `POST /api/v1/bridge/{integrationId}/catalog-preview` with `Authorization: Bearer`, `snapshotId`, `schemaVersion`, `sourceVersions`, and `classes`/`feats`. Server caps payload, validates item counts/shapes and stores as one transaction with hash and timestamp; response includes accepted revision.
4. Production-scale catalogs replace preview with `start → bounded batches → hash/check counts → commit`; use a per-integration write lease and idempotency key. Previous complete snapshot remains queryable on interruptions.
5. Ruleset sync **never** mutates character futures, existing actor snapshots, prepared spells, equipment or wishlists. Actor refresh and explicit Leveler import are separate privileged workflows.
6. Treat `Item` UUID as canonical; keep the selected source/compendium and revision, and fallback display label for removed compendiums.

Never serialize raw full actor objects during ruleset sync; don't serve paid compendium contents to unauthorized website users. Secure content distribution may require a content licensing policy beyond the prototype.

## 6. HTTP/API v1 implementation inventory

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `POST /api/v1/setup` | one-time bootstrap env token | Create initial owner |
| `POST /api/v1/auth/login` | username + password | Establish browser session |
| `POST /api/v1/auth/logout` | browser session | Revoke cookie session |
| `GET /api/v1/me` | browser session | Current user/campaign memberships |
| `GET /api/v1/users?q=` | site owner or campaign GM | Minimal existing-user directory |
| `GET /api/v1/campaigns/{id}/members` | campaign GM | Roster |
| `POST /api/v1/campaigns/{id}/members` | campaign GM | Add existing user or reserve new player + code |
| `POST /api/v1/join/redeem` | one-time invite code | Set username + password, activate account |
| `POST /api/v1/pairing-codes` | site owner/GM | Issue world-pairing code |
| `POST /api/v1/bridge/pair` | pairing code | Create/attach campaign; issue client token pair |
| `POST /api/v1/bridge/{id}/authorize` | one-time pairing code from an existing campaign GM | Authorize another GM browser for same integration |\n| `POST /api/v1/bridge/{id}/refresh` | rotating refresh token | Short-lived access renewal |
| `POST /api/v1/bridge/{id}/catalog-preview` | access bearer + authorized GM | Transactional bounded rules preview |
| `GET /api/v1/campaigns/{id}/catalog-preview` | campaign membership | Permission-filtered published preview |
| `POST /api/v1/bridge/{id}/revoke` | authorized GM/owner session | Revoke paired device(s) |

**Implemented in this feature branch but not yet tested:** bootstrap, login/logout, me, user directory, membership reads/writes, join redemption, pairing code issuance, initial pair, existing-world reauthorization, rotating refresh, core PF2e preview upload and campaign preview retrieval. **Not implemented:** bridge revoke endpoint, password reset/reinvite/reissue, GM promotion, full catalogue batching or actor apply. API table is a contract; unimplemented routes must not be assumed available.

## 7. Operational controls and test gates

- `PUBLIC_ORIGIN` is mandatory for production; HTTPS with a trusted certificate and correctly configured reverse proxy. Use `127.0.0.1` only for local development and do not advertise to non-local Foundry.
- `DB_PATH` resides on a persistent Docker volume, file permissions restricted to service user. Use SQLite WAL, foreign keys, transactions and periodic backup/checkpoint.
- Generate `BOOTSTRAP_TOKEN` independently; provision it as a secret rather than storing in Compose or git. Rotate/remove after owner setup.
- Reject registration on private unexpected origins, log no invitation codes, session IDs or refresh/access tokens, and redact secret query parameters.
- Rate-limit bootstrap/login/code redemption/pairing/refresh per IP and identity; reverse-proxy quotas provide an additional control, not the only control.
- Explicit negative tests: used/expired invite, concurrent invite redeem, wrong password, expired and re-used refresh token, stolen bearer, cross-campaign access, revoked GM, CORS mismatch, stale snapshot, maliciously large body, aborted upload, cloned world ID.
- Unit/integration tests should run with temp SQLite databases and no network. Browser/Foundry v14 integration tests are **mandatory** before calling module pairing functional.

## 8. Dependencies

`apps/foundry-module/module.json` must declare `pf2e-leveler` under `relationships.requires`. Foundry can prompt to install missing dependency and enable alongside the bridge. The active module version is included in each synchronization envelope. The bridge should read canonical feat schedules from Foundry class Items, using Leveler only for optional variant progression and plan import/validation/application.
