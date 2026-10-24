# PF2e Planner

Private monorepo for a **Docker-hosted Pathfinder 2e / Starfinder 2e character planner** and an independently installable **Foundry VTT v14 bridge module**.

> **Development status: v0.3.0 implementation branch.** Web login/account activation, pairing, GM-client bearer tokens and a **bounded metadata preview** are coded but not yet verified by a complete npm build, container test or real Foundry v14 integration test. This is **not yet ready for public deployment or real character imports**.

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

## v0.3.0 — Ruleset variants, compendium import and browsing

An authorized Foundry GM now has **Open Pairing Dialog → Sync Now (no code needed)**. This uses the browser's existing rotating bridge credential (re-authorization required only if revoked or expired). It includes a GM-only, opt-in selection of additional Item compendium packs; the core PF2e `classes` and `feats-srd` packs are always included. On initial pairing and manual Sync, the bridge exports **all feat and class Items** in the selected packs (not only a 1000-item preview) including descriptions, levels, traits, rarity, categories, and class progression schedules.

The bridge reads the active Foundry PF2e **variant rule settings** (Free Archetype, Gradual Ability Boosts, ABP, Mythic, Proficiency Without Level and Stamina) and relevant PF2e Leveler settings (Dual Class, Ancestral Paragon, archetype dedication lock and prerequisites). These are persisted with the catalog revision and shown on the homepage and GM ruleset details. `null` means no setting was available.

Website → campaign → **Browse imported feats** offers search, level, rarity, trait, feat category and source pack filters; clicking a feat displays sanitized rich descriptions. Foundry inline `@UUID` references and pre-rendered `data-uuid` compendium links navigate to other synchronized Items, including a back history. Unsupported targets show a message rather than opening a live Foundry app or executing its RuleElements/rolls.

Uploads are staged in bounded authenticated batches and only replace the published ruleset when every expected entry is received. Automatic GM-login sync is skipped when the source system/version, variant settings and selected packs are unchanged; **Sync Now** forces a refresh.

**Important limits:** Only class/feat Items are currently imported, not spells, equipment, backgrounds, ancestries or actors. Selected third-party packs require GM approval and appropriate player content rights; the app never copies licensed content into the GitHub repository. Rich descriptions are sanitized before storage. Browser UI of the Foundry module still needs manual live-world verification.

### Richer content synchronization (v0.3.1)

The Bridge now imports all **Item subtypes** from GM-selected packs and automatically
includes installed official PF2e action, condition and effect packs for common
linked references. The feat browser displays stylized Foundry `@Template`,
`@Damage` and `@Check` codes (with nested brackets correctly parsed),
follows imported `@UUID`/`@Compendium` Item references, and tries to open
`@Action` slugs as imported action Items. This is **display-only**;
it never rolls damage, places measured templates, or executes actor-related
check/RuleElement logic.

A third-party module being **enabled is not consent to publish its text**
to the site's players. Select its Item compendium packs in the Foundry
Bridge's **Compendium packs to import** section and run **Sync Now**.
Only selected/required packs are synced; module-specific client-side
data outside Item compendiums is not automatically exported.

## v0.4.0 — Character Workshop

Visit your synced campaign home and choose **Open character builder**.
Characters are saved per player/campaign in the existing persistent SQLite
volume (no database reset). The workspace provides:
- Editable character name and actual level 1–20; ancestry, heritage, background,
  primary class and optional Dual-Class second class.
- A Pathbuilder-inspired **level progression** based on imported class
  class/skill/general feat schedules (falling back to typical schedules if
  missing), with Ancestry feats and Free Archetype slots where Foundry's
  synchronized ruleset reports those options enabled.
- Searchable feats with GM-imported source pack, rarity, feat type, trait and
  level filters. Equipment/items can be added to a character inventory.
- Optional user-entered ability modifiers and personal notes, with auto-save,
  revision conflict detection and a GM-visible character roster.
- Hover previews for inline Item links, click-through details with Back, and
  Ctrl-click/⌘-click to open a small standalone item window.
- Supported `@Damage` level expressions, e.g.
  `(floor((@actor.level - 1)/2) +2)d4[slashing]`, evaluated **only as
  read-only dice counts at the selected character level** (not an actual roll).
- Four persistent color themes: Moonstone, Parchment, Verdant and Amethyst.

**Rules-engine limitations:** Build records store choices but do not yet enforce
every prerequisite, apply all class features, calculate derived AC/saves/HP,
implement complete spellcasting or execute Foundry Rule Elements. A choice
listed by level/category is not proof of character eligibility. Do not use the
planner as a rules validator until its full mechanics engine is implemented.

The Foundry GM settings expose three distinct controls:
**Pair World** (website URL + OTC, Test Website/Pair buttons),
**Sync Now** (authorized manual import without new code), and
**Select Compendium Collections** (searchable groups by parent package;
official PF2e Item packs selected by default, third-party opt-in).
Group selections are saved separately from manual sync.

### v0.4.1 — Character selection and mobile usability

- When the viewport is <=700px, **Details** opens a fixed full-screen panel
  on top of the builder with a clearly visible close button; the user is not
  scrolled down to a description below the level track.
- The Heritage picker defaults to **ancestry-compatible or versatile**
  heritages based on imported heritage ancestry UUID/slug. **Show incompatible
  heritages** exposes others when planning homebrew combinations, highlighted
  in light red with a warning (also reflected on selected heritage cards).
- Class/ancestry feats rank compatible options first. Class traits, feat
  category, level and textual prerequisites generate warnings rather than
  blocking intentionally unconventional combinations. Full PF2e prerequisite
  evaluation is **not yet implemented**.
- Background picker supports **OR matching** of constrained attribute boost
  choices (e.g. STR or CON), trained skill search and granted-feat search.
  The free ability boost is not treated as a background's fixed boost.
- Class profile expands to show imported key attribute, progression feat
  levels, initial saves and Perception proficiency.
- Spellcasting classes (including Bard) get a **Spells** view for saving a
  repertoire of cantrips and ranked spells, filtered by imported spell
  traditions and spell rank. This first pass is **a selectable spell list**,
  not a full spell-slot/repertoire-limit validator.
- Website/Foundry versions must match **v0.4.1**, and the GM must run
  **Sync Now** after updating the Foundry Bridge, because existing catalogue
  snapshots from v0.4.0 **do not contain** heritage ancestry, background
  boosts, class saves/spellcasting or spell tradition fields.

## v0.5.0 — PF2e Leveler advancement integration

The Planner Bridge now imports the **real code of the installed** PF2e Leveler
at runtime, calling its `ClassRegistry` and `getChoicesForLevel()`. At sync
time, each imported class gets a `levelerProgression` metadata object with
the actual level-2–20 options for the Foundry campaign's active variant rules,
including Ability Boosts, Skill Increases, Class/Skill/General/Ancestry feats,
Free Archetype, Dual Class, Mythic, ABP and spellcasting. Class key abilities
and Leveler's per-level spell slots are included.

On the website, **attributes are not a separate tab**. Level 1 source boosts
and later Leveler-derived ability boosts appear in the SAME progression list as
feats, skill increases and spellcasting steps. Planned boost allocations are
saved to the player's character in SQLite. Old characters are preserved, but
Leveler choices will not appear until the GM performs **Sync Now** with the new
Foundry Bridge.

This is a compatibility adapter rather than a duplicate PF2e rules engine:
the Foundry Bridge relies on Leveler's installed code, while the website
renders its serialized advancement choices. Full prerequisites and derived
build state still require the character's Foundry actor and a later
actor-backed validation integration; the Planner does not claim to have
ported `computeBuildState()` or `validatePlan()` to a Node web server.
Existing browser-side eligibility messages remain advisory only. Some
advanced first-level ability boosts and skill rank restrictions cannot be
validated without actor context.

## v0.6.0 — Delta compendium sync, Leveler selections and Foundry character import

**Source of content:** The Bridge now directly invokes PF2e Leveler's
`getCompendiumCategoryKeys()` and `getCompendiumKeysForCategory()` inside
Foundry to obtain the packs **actually selected in Leveler's Compendium
Manager**. Additional packs explicitly selected in the Planner remain additive.
GM `resolveGuidanceStatus()` rules from Leveler's content guidance exclude
`disallowed` Items entirely. `recommended` and `not-recommended`
guidance is preserved to label/rank feat choices. A module being enabled
without its pack being selected in Leveler or Planner is not enough to export
its content.

**Content-addressed delta sync:** Every sync scans selected Items locally
and calculates SHA-256 digests of normalized exported data **per pack**,
including Leveler progression and GM guidance metadata. Only packs whose
digest or count changed transmit their Items; unchanged packs are copied
server-side from the previously published SQLite revision. A transactional
commit swaps all content, preventing partial publication. When everything is
unchanged, no Items are uploaded at all. New installations use a full initial
import. **Per-Item** delta inside a changed pack is not yet implemented.

**Leveler dialog integration:** The Bridge adds a **PF2e Planner** button
to PF2e Leveler's character creation wizard and level planner in Foundry for
**GMs**. It opens a searchable selector of character Actors in the current
world and a campaign-member assignment selector from the website. Choosing
a character sends only its name, level, synchronized Item UUID references,
basic ability modifiers and selected Leveler progression choices (if the
open Leveler planner belongs to that Actor). The matching website character
opens in a browser tab. Private GM notes, biographies, secrets, Rule
Elements and whole actor documents are not exported. A repeat import
preserves existing website edits unless the GM explicitly requests overwrite.
Unmatched or unselected Item UUIDs are skipped and reported.

The website now warns clearly for ancestry feats whose published
Leveler-style creature/ancestry traits exclude the selected ancestry.
Illegal choices remain visible and can be selected for future planning,
as requested. Level-one ability boosts are visible alongside feats
**even before selecting a class**. Class-key and background-boost restrictions
use imported class/background metadata. Spell selection uses Leveler's
class spell-rank slot progression where available.

**Still requires development:** importing a Foundry Actor's completed
Leveler creation selections, validating PF2e Leveler `computeBuildState`,
`checkPrerequisites` and `validatePlan` against a real actor, applying
spellbook/class-specific choices and advanced ancestry access rules. Current
frontend warnings are not a replacement for Leveler's actor-based legality.
