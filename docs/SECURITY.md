# Security and licensing baseline

**Unverified alpha warning:** Basic authentication, pairing and a bounded preview sync are now coded on the feature branch, but have not passed a complete build or real Foundry integration test. Do not publish this to an internet-facing address yet. See [AUTH_AND_SYNC_V1.md](AUTH_AND_SYNC_V1.md).

Before release:
- Strong admin auth (prefer passkeys); explicit GM/player membership role enforcement on every server operation.
- Player invites: cryptographically random, hashed, single-use, short expiry; confirm redemption via button to avoid link preview bots. Redirect away from token URL and use `Referrer-Policy: no-referrer`.
- Revocable `Secure`, `HttpOnly`, `SameSite` session cookies, sensible renewal bounds; rate-limit all invitations/pairing.
- CSRF protection and HTTPS. Never write secrets to application logs, browser-accessible world settings, or query strings.
- Authenticate and scope integration by server-side credentials; validate payload shape, content licensing, maximum sizes, integrity and ownership.
- An authenticated GM browser is not a trusted private backend: design credential handling for multi-GM session revocation explicitly.
- Do not serve restricted/premium content from a raw catalog API to players without authorization and a license/legal basis.
- Use backups, migrations, audit logs and explicit confirmation for actor-affecting actions.
- Do not bundle copyrighted compendium content or copy upstream code without reviewing licenses/attribution.

The private repository is not itself a security boundary for a hosted website.
