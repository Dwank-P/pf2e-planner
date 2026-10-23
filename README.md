# PF2e Planner

Private monorepo for a **Docker-hosted Pathfinder 2e / Starfinder 2e character planner** and an independently installable **Foundry VTT v14 bridge module**.

> **Development status: v0.2.4 implementation branch.** Web login/account activation, pairing, GM-client bearer tokens and a **bounded metadata preview** are coded but not yet verified by a complete npm build, container test or real Foundry v14 integration test. This is **not yet ready for public deployment or real character imports**.

## Two applications, one repository

| Component | Location | Responsibilities |
| --- | --- | --- |
| Web application | `apps/web` | Site owner, global user/password accounts, GM campaign roster, invitations, pairing codes, SQLite, protected preview API |
| Foundry Bridge | `apps/foundry-module` | Requires PF2e Leveler; GM-only pairing UI, GM-browser IndexedDB token storage, token refresh, read-only PF2e classes/feat preview sync |
| Shared contract | `packages/shared` | Versioned data exchange definitions (preview contract not finalized) |
| Documentation | `docs` | Security, requirements, auth protocol, threat model and implementation plan |

The **PF2e/SF2e system** provides classes, skills, feats, spellcasting and other rules. PF2e Leveler is an integration dependency for extra progression/variant handling and future import/apply.

## Read before deploying

- [Authentication and synchronization v1](docs/AUTH_AND_SYNC_V1.md)
- [Security decisions](docs/SECURITY_DECISIONS.md)
- [Developer installation and test checklist](docs/DEVELOPMENT_TESTING.md)
- [Project specification](docs/PROJECT_SPECIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)

**Security model:** GM authorizes Foundry through an HTTPS website pairing code. Website issues short-lived access + rotating refresh tokens. Each GM browser keeps tokens in **IndexedDB**; only a non-secret URL and integration UUID are stored in Foundry world settings. A GM browser is not a trusted private server; malicious extensions or module scripts can steal client tokens. The website verifies the token, origin and campaign GM membership for each sync request.

## Web development

Requirements: Node.js >=24.15 and npm. Dependencies include `@node-rs/argon2` for password hashing and Node's `node:sqlite` implementation. SQLite uses a **single server instance**; don't scale this Compose service to multiple replicas.

~~~sh
cd apps/web
npm install
cp .env.example .env
# Set PUBLIC_ORIGIN and strong BOOTSTRAP_TOKEN before starting.
npm run dev
npm run check
npm test
~~~

The initial owner opens the web UI → **Initial server setup** → supplies the environmental bootstrap token and creates their own username/password. Remove/rotate that environment token afterwards.

For loopback-only Docker testing, from repository root:

~~~sh
export BOOTSTRAP_TOKEN="$(openssl rand -hex 48)"
docker compose up --build -d
~~~

In production configure `PUBLIC_ORIGIN` as the real HTTPS origin, reverse proxy, backup, rate limits, certificate and application security before remote use. The Compose file deliberately binds to `127.0.0.1:3000`; Foundry on other machines **cannot** reach that URL as a website. Never commit bootstrap/password secrets.

## Foundry module development

The current source manifest is `apps/foundry-module/module.json`, with `pf2e-leveler` required.

For manual installation, put the contents of `apps/foundry-module/` in Foundry user data `Data/modules/pf2e-planner-bridge/`, reload and enable the module as GM. The previously installed v0.1.0 build is only a diagnostic bridge. **An installable v0.2.0 alpha manifest and ZIP are now staged on the separate `foundry-release` branch**; temporarily make the repository public to install/update through that branch's manifest (then restore private). See installation guide.

Once website is accessible to your GM Foundry browser over HTTPS and an owner is set up:

1. Generate a one-time pairing code on the website.
2. Open Foundry as GM, enable Bridge + PF2e Leveler, and use the **PF2e Planner — Pair / Sync** action in Game Settings. If button isn't visible, open the browser console and run `PF2ePlannerBridge.openPairingDialog()`.
3. Enter the **website origin** and code. Website creates a campaign; bridge stores credentials in the **current GM browser** and sends at most **1000 core PF2e feat-index entries** plus core class progression metadata as a prototype.
4. Add a player to the campaign from the website: select an existing global user, or enter a new name. For a new player, share the code with them so they can choose a username and password on `/join`.

This initial preview intentionally does **not** sync full compendiums, third-party content, actors, spells, equipment or Leveler plans.

## Notes

- Repository is private; Foundry's installer requires an accessible manifest + ZIP. See [Foundry installation](docs/FOUNDRY_INSTALLATION.md). A v0.2.0 alpha archive is packaged on `foundry-release`, but has not been tested inside a running Foundry v14 client.
- Never include installed premium rulebooks, actor data, secrets or privately licensed content in public repository releases.
- No public project license has been selected.

### Deployment version check

The Docker container startup log prints website version, source fingerprint,
build timestamp, `PUBLIC_ORIGIN` and *requested* host bind IP. The same version and
fingerprint are returned by `GET /health`. To verify the **effective Docker port
binding**, inspect `docker ps` or `docker inspect` on the host. See
[developer deployment testing](docs/DEVELOPMENT_TESTING.md).

### Connecting a Foundry GM browser (module v0.2.4)

Foundry **Game Settings → Configure Settings → PF2e Planner Bridge → Open Connection Settings** has the website URL field and the **one-time pairing code** field. Click **Test Website** to verify the URL (does not consume the code), then **Pair & Sync**. Merely saving the website URL does not pair a world. The server must also run v0.2.4 for the reachability probe. An unauthorized/no-network request displays a Foundry error notification.

### v0.2.4 usability fixes
The GM dashboard can generate an invitation without pre-selecting the player's name, copy the player-facing invitation, and copy pairing codes. Invitation validation is separate from password creation. Normal players do not lose their login session when the GM-only roster endpoint rejects their access. The Foundry Bridge has one visible **Open Pairing Dialog** settings control; URL inputs accept domains/IPs with automatic HTTPS default and actionable validation errors.

### Player-facing invitation flow (v0.2.4)

GM chooses a campaign and clicks **Generate invitation**, no player display name needed. The one-time code appears in a formatted message addressed to the player, with a copy-to-clipboard icon. On `/join`, the player validates the code before username/password are requested. There is also a copy icon for Foundry pairing codes. Normal player sessions are not invalidated by the GM-only roster API.

### Inspect synchronized rulesets (v0.2.4)

Each campaign on the home screen now shows the **stored** PF2e system version,
Leveler version, class/feat counts, and last received timestamp. A GM/owner link
opens a read-only detailed received-catalog dashboard with source pack distribution,
class schedules, first 1000 feat metadata rows, snapshot SHA-256 and warnings
about excluded content. Server routes `catalog-summary` and `catalog-details`
derive these fields from the last accepted SQLite snapshot. The current bridge
still does not export a complete rulebook or third-party content.
