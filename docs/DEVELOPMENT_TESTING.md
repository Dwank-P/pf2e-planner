# Development test plan — web + Foundry Bridge v0.2.0

**Status: unverified alpha implementation. Do not put an unfinished build on a public hostname.**

## A. Website startup

1. Use Node >=24.15 or Docker Node 24 image. Set `BOOTSTRAP_TOKEN` to 48+ random bytes and `PUBLIC_ORIGIN` to the exact address loaded by the web browser; create an appropriate persistent SQLite volume.
2. For local testing run `npm install && npm run check && npm test && npm run dev` inside `apps/web`. Inspect failing commands: tests/build have not been executed by the assistant in the connected repository environment.
3. Open the website, select **Initial server setup**, enter the bootstrap token, unique login username, display name, and 12+-character password. Confirm the dashboard shows you as owner.
4. Sign out and log in again using **only username/password**; setup should now refuse repeat attempts. Ensure cookie is HttpOnly and session persistence works after reload.
5. Remember to remove or rotate `BOOTSTRAP_TOKEN` once initialized.

## B. Website/Foundry same-origin requirements

- Site must have a trusted HTTPS URL reachable from the **Foundry browser**. If web Compose binds only localhost on a different server, Foundry cannot reach it; expose it through your reverse proxy only after security review.
- Set `PUBLIC_ORIGIN=https://your.real.host` exactly. Configure reverse proxy to forward proper scheme/host, limit bodies, avoid logging token-bearing JSON and terminate HTTPS.
- Foundry's own URL should be HTTPS as well; the bridge binds its origin during pairing. There are no bridge session cookies; cross-origin bearer requests require a CORS preflight.
- For local testing only, `ALLOW_INSECURE_LOCAL_BRIDGE=true` permits a `http://localhost` Foundry origin. Never use this in production.

## C. First pair

1. In web dashboard click **Generate pairing code** while logged in as site owner or campaign GM.
2. Install the **v0.2.0 alpha** manifest from the `foundry-release` branch (briefly public GitHub repository for install), then enable Bridge and PF2e Leveler in a PF2e test world. Verify Bridge dependency shows in module management.
3. In Foundry's Game Settings use **PF2e Planner — Pair / Sync**, or console `PF2ePlannerBridge.openPairingDialog()`.
4. Enter website **origin only** (no path, query or fragment), plus code. Website creates campaign and GM membership. Bridge stores **only** URL and integration UUID in world settings. The GM browser IndexedDB holds secrets.
5. Confirm the website lists the new campaign and that its `GET /api/v1/campaigns/{id}/catalog-preview` returns core PF2e class data and at most the first 1000 feats. **Do not** treat this as complete catalog synchronization.
6. Reload Foundry as same authorized GM: elected/active GM may refresh tokens and sync again. Attempt the pairing in a second GM browser: it needs a fresh code and should authorize to the **existing integration**, not create a duplicate group. A GM must already have website GM membership on the campaign to authorize.
7. Expire/reuse an old pairing code: expect rejection. Reuse a rotated refresh token: expect credential revocation. Verify bearer requests from wrong origins fail.

## D. Player onboarding

1. Select the campaign on the dashboard → Players.
2. Click **Add existing user** → search by name/handle → select. Confirm the user is added without changing password, and sees both campaigns on next login.
3. Click **Create new player** → enter display name. Copy the one-time invite code. Open website `/join` in a second browser/private window, paste code, choose unique username and 12+-character password.
4. Confirm that code cannot be redeemed twice or after expiry. Log in normally with the new username/password.
5. Check a normal player's session cannot search global users, generate pairing codes, add members or access another campaign's preview.

## E. Regression / negative cases

- No `BOOTSTRAP_TOKEN`: setup fails.
- Incorrect user credentials: generic error, throttled by IP + username.
- Browser `Origin` mismatch: blocked by server for cookie operations and bridge API.
- Invalid or replayed invitation/pairing code: refused.
- Cross-campaign access: forbidden.
- Unapproved GM/non-GM bearer: forbidden.
- World/bridge offline: website shows last accepted preview but does not silently mutate plans.
- World clone/changed site origin: require an explicit reconciliation path, not silent overwrite.
- Partial or oversized sync: rejected without overwriting previous accepted preview.
- Inspect developer tools and Findry world settings: **access/refresh tokens must never appear in exported settings, URLs, or logs**. Browser IndexedDB is intentionally GM-session sensitive.

## F. Known limitations before production

- Real Foundry v14 UI/install and SvelteKit build still require testing.
- No production-scale staged compendium sync (preview only, core PF2e, 1000 feats).
- No actor import/export, character builder or Leveler plan-application workflow yet.
- No user password reset/reinvitation, token-management/revocation UI, or campaign GM promotion controls yet.
- Dependency version compatibility with other Foundry or Leveler versions is not yet certified.
- A GM's browser can be compromised by malicious scripts/extensions. Never treat its token storage as an unattended server secret.
- SQLite uses one process and no automatic backup/checkpoint yet; arrange safe external backups.

## G. Confirming deployments and the Docker host bind address (v0.2.1+)

Portainer → Containers → `pf2e-planner-planner-web-1` → **Logs** shows a startup banner:
`Starting web v0.2.1`, `Source fingerprint: <16 hex chars>`, image build time,
container listener, the **requested** host bind address and public origin.

Version is read from `apps/web/package.json`. The fingerprint hashes the application's
source, not the Git commit; it changes when a website source file changes, even when
Portainer's Docker build context lacks `.git`. The build date changes on rebuild.
`GET /health` returns the same version/fingerprint/time; it must be served uncached.
No authentication secrets are logged.

**Important:** A container cannot prove its host's effective port publication.
`PLANNER_BIND_IP` in the container reports the *requested Compose value only*.
Confirm the **actual** mapping on the Docker host:

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep planner
docker inspect pf2e-planner-planner-web-1 --format '{{json .NetworkSettings.Ports}}'
curl -v http://192.168.1.40:3000/health
```

For Nginx Proxy Manager on another machine forwarding to `192.168.1.40:3000`,
set Portainer Git-stack environment variable `PLANNER_BIND_IP=192.168.1.40`,
then **Pull and redeploy** the stack. Confirm the port is published as
`192.168.1.40:3000->3000/tcp`, not `127.0.0.1:3000->3000/tcp`.
The IP must exist on the Docker host (`ip -br addr`). Use an appropriate firewall
and restrict incoming access to the reverse proxy. Keep `PUBLIC_ORIGIN` as
`https://level.dwank.uk`. No need to expose port 3000 to the public WAN.
