# PF2e Planner

Private monorepo for a **Docker-hosted Pathfinder 2e / Starfinder 2e character planner** and an independently installable **Foundry VTT v14 bridge module**.

> **Status: v0.18 — in testing.** The website and Bridge are used with real Foundry v14 worlds
> and PF2e Leveler, but there is no automated end-to-end test against Foundry yet. Keep the built-in
> backups (Server admin → Backups) and copy them off the server before relying on it as the only
> copy of your plans. Release notes for each version are at the end of this file.

**Known gaps:** feat and specialization sub-choices (ChoiceSets) are made in Foundry; legality checks
are planning-grade (Leveler re-checks against the actor); focus, innate and archetype spellcasting
aren't planned yet; level-1 extras aren't applied by Leveler.

Local preview without Foundry: `DB_PATH=./data/dev.sqlite node scripts/seed-dev.mjs`, then
`DB_PATH=./data/dev.sqlite npm run dev` and sign in as `gm` (password in `scripts/seed-dev.mjs`).

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
D&D 5e worlds use the separate `apps/foundry-module-5e/` module (id `planner-bridge-5e`, requires the `dnd5e` system, no Leveler).

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
- Licensed under the [MIT License](LICENSE). Third-party attributions (PF2e Leveler) are in [NOTICE.md](NOTICE.md).

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

### v0.6.1 — Preserve unsaved Leveler creation-wizard choices

When the GM opens **PF2e Planner** from Leveler's Character Wizard, the
selector now carries the wizard's current (even unapplied) ancestry,
heritage, background, class, dual-class, feat, basic spell and ability-boost
selections into the corresponding website build. Leveler's specialized
creation metadata (subclass, deity, implements, kinetic gates, apparitions,
thesis, languages and other class-specific choices) is also preserved and
displayed in a compact imported-choices disclosure. These specialized
selections are currently **read-only in the website**, pending an actor-backed
Leveler editing adapter. The GM can assign the imported build directly to
an active website campaign player rather than owning it themselves.

### v0.7.0 — Leveler-native builds and Pull from Planner

Website character builds are now stored as **PF2e Leveler's own creation and
level-plan documents** (the `pf2e-leveler.creation` / `pf2e-leveler.plan` actor
flags), so a build moves between Foundry and the website without losing
Leveler's metadata. The builder still shows the familiar level track;
unchanged picks keep Leveler's choices, skill rules and ranks exactly as Foundry
wrote them. Older builds load as before and convert on their next save.

- **Send to Planner** (Leveler wizard/planner header) uploads Leveler's
  documents directly; choices read from the actor's Items only fill gaps.
- **Pull from Planner** (new, GM only) picks a Foundry character and a website
  build, previews it with warnings, links them, and replaces the actor's
  Leveler plan. Wizard choices are replaced only for actors without a class.
  Leveler applies the plan on level-up as usual.
- The builder's **Leveler ▾** menu downloads the plan and creation in Leveler's
  own Import formats.

Limits: Leveler ignores a plan whose class differs from the actor's class (the
Pull dialog warns); new website skill increases use an approximate target rank;
class-specific creation choices stay read-only on the website.

### v0.7.1 — Builder fixes: Origin step, level-1 choices, spell limits

- **Origin step:** ancestry, heritage, background and class now live on their
  own "Origin" entry at the top of the level track instead of repeating above
  every level. New builds open there; level 1 follows.
- **Level 1 asks for everything Leveler's wizard does:** class specialization
  (subclass) where the class has one, a level-1 class feat and skill feat when
  the class grants them, alongside boosts and the ancestry feat.
- **Automatic class features** are listed at each level ("Gained automatically
  at level N"), with links to their rules text.
- **Ability boosts no longer replace an earlier pick** when a slot is full;
  deselect one first.
- **Spells are learned per level within Leveler's limits:** level 1 uses the
  Character Wizard counts, spontaneous casters learn their repertoire growth,
  spellbook casters add two spells per level, and other prepared casters learn
  none. The Spells tab is now an overview of everything learned.
- **Foundry:** the Send/Pull buttons sit before the Leveler window's close
  button, and Leveler modules load correctly when Foundry runs under a URL prefix.

**After updating, the GM must run Sync Now once** so the website receives
class features, specialization tags and spell counts.

### v0.8.0 — Redesign: party, campaign settings and Character Wizard

A new look and layout (dark by default, full light theme, PF2e trait chips and
the T/E/M/L rank ladder) and three rebuilt screens:

- **Party**: every character with plan progress and Foundry link; GM tools live
  under **Campaign settings** (sync status, variant rules, packs, pairing,
  players and invitations).
- **Character Wizard** (level 1): steps are generated from your class the way
  Leveler's wizard does it (specialization, deity and sanctification, thesis,
  implement, kinetic gate and so on appear only when your class needs them),
  with a live summary of attributes, HP, proficiencies and skills. It saves
  straight into Leveler's creation data.
- **Level Planner** for levels 2–20 is still the previous screen (rebuilt next).

The project is now MIT licensed. **After updating the Bridge, run Sync Now once**:
the wizard needs the rules data the new Bridge exports.

### v0.9.0 — One builder for levels 1–20

- **One screen for the whole character.** The rail lists the level-1 steps and levels 2–20, and shows
  what you picked under each (feats, boosts, skill increases, spells), like Pathbuilder. Everything
  stays editable at any time; nothing locks once you start planning later levels.
- **Levels 2–20 rebuilt** in the new design: every slot Leveler's schedule gives (class, skill,
  general, ancestry, archetype and dual-class feats, boosts with partial boosts above +4, skill
  increases capped by level, spells learned per rank), plus the class features gained automatically.
- **Legal options by default.** Feat lists show only what fits the character at that level: feat
  level, ancestry access, skill-rank and attribute prerequisites, feats taken earlier, repeats and
  the archetype dedication rule. Tick *Show unavailable* to see the rest with the reason. Anything
  the planner can't read is marked *Check* instead of being hidden.
- **Background filters**: by attribute boost, trained skill and granted feat.
- **Languages are never gated**: uncommon, rare and secret languages sit behind show/hide tick
  boxes, using your world's language rarities (Bridge 0.9 exports them).
- The summary column follows the selected level: attributes, HP and skill ranks at that level.

**After updating the Bridge, run Sync Now once** so the website gets your world's language rarities.

### v0.10.0 — Spells, sync scope and player management

- **Bridge sync follows PF2e Leveler exactly**: only packs assigned in Leveler's Compendium Manager are
  uploaded (third-party content only when Leveler has it assigned), plus the PF2e condition and
  action reference packs so links like *Frightened* open. The Bridge's own pack picker is gone.
- **Quieter Foundry**: a sync shows at most two notifications, a blue "Syncing…" and then a green
  success or red error.
- **Spells**: bard/oracle level-1 picks no longer count the spell their muse or mystery grants;
  every rank is pickable on later levels; **signature spells** from level 3 (one per rank, from your
  repertoire); filter spells by the defense they target (AC, Fortitude, Reflex, Will, none).
- **Rules text**: Foundry inline actions such as `[[/act perform skill=acrobatics]]{Acrobatics}` show
  as action links, and inline rolls as formula pills.
- **Phones**: the builder's steps and levels open from a ☰ button instead of filling the screen.
- **Players**: GMs can remove players or cancel unused invitations; the server owner can delete
  accounts (their characters move to the owner).

**After updating the Bridge, run Sync Now once**: it re-uploads with Leveler's exact pack list and
spell defenses.

### v0.11.0 — Equipment plan and a steadier summary

- **Equipment plan**: a wishlist of items you want while levelling. Browse every synced item with
  filters for type, consumable or permanent, and level range; sort by level, price or name; park
  each item on the level you want it at. Each level's page lists what you planned for it, with a
  total; tick items off as bought.
- **Level 1 reads like levels 2–20**: one card per creation step, opened in place.
- **Summary** always shows HP, Class DC, Perception, saves and skills with modifiers, at the
  character's current level rather than the level you're editing. Class features such as Reflex
  Expertise raise proficiencies at the right level.
- **Spells can't be learned twice**: a spell learned at one level shows *Learned at level N*
  elsewhere. Spell rank headers open and close like other choices.
- **Boosts**: fixed ancestry boosts are shown locked; flaws are shown in red and can be boosted
  back to 0. **Languages** show a big X/N counter. Empty choices show “—”.

**After updating the Bridge, run Sync Now once** so the website gets item prices and class
proficiency features.

### v0.12.0 — Icons, dual-class spells and formulas

- **Icons**: Sync Now uploads the icons your world's compendiums use, and the website shows them on
  options, level cards and the equipment plan. Icons are stored per world.
- **Pull from Planner fixes Leveler's icons**: choices pulled into Foundry use this world's
  compendium icons, so Leveler's wizard no longer shows broken images.
- **Dual class casters**: a second spellcasting class gets its own level-1 spell step and its own
  spells (and signature spells) at every level, stored the way Leveler stores them.
- **Formulas and other granted picks**: alchemists choose their 4 Alchemical Crafting and 2 formula
  book formulas at level 1 and 2 more each level; feats such as Alchemical Crafting ask for their
  formulas at the level you take them. The rules follow Leveler's own feat-grant detection.

**After updating the Bridge, run Sync Now once**: it uploads icons and the feat data formulas need.

### v0.13.0 — Sharing, accounts, storage and Pathbuilder import

Website only; the Foundry Bridge stays at 0.12.0.

- **One world, several Foundry addresses**: opening the same world from another domain no longer
  fails with a CORS error. Generate a pairing code on the website and enter it in the Bridge at the
  new address; Campaign settings → Foundry world lists each address and can remove one.
- **Character sharing**: *Share* on a character offers Only me (and the GM), Campaign can view,
  Campaign can edit, or Chosen people with view or edit each. GMs always keep access. Viewers see
  the build read-only; shared characters appear on the party page.
- **Pathbuilder import**: *Import from Pathbuilder* on the party page takes a Pathbuilder 2e JSON ID
  (or a pasted export) and builds the character from your campaign's compendiums: origin, class,
  boosts, skills, feats, spells, lores, languages and gear (into the equipment plan as bought).
  Pathbuilder doesn't record when skill increases and later spells were chosen, so they're placed at
  the earliest legal level; the import report lists anything it couldn't match.
- **Your account**: account menu → *Account* changes your username, display name and password.
- **Server admin** (server owner): account menu → *Server admin* shows database, write-log (WAL),
  compendium, icon and character storage, overall and per world; runs checkpoint, cleanup, optimize
  and compact; and issues one-time password reset links for locked-out users.
- **Lores**: lore skill increases are now stored the way Leveler stores them (`warfare-lore`).

**Storage settings (compose.yaml)**, both optional; unset keeps today's behaviour:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PLANNER_DATA_SOURCE` | `planner-data` (named volume) | Volume name or host folder mounted at `/data`. A host folder must be writable by uid 1000. |
| `PLANNER_DB_PATH` | `/data/planner.sqlite` | Database file in the container. Keep it under `/data` so it persists. |

After a large catalog sync the website folds the write-ahead log back into the database
automatically (once it passes 32 MB) and caps it at 64 MB after checkpoints. *Compact* rebuilds the
file to return free pages to the disk; it needs about the database's size again in free space and
pauses saving while it runs, so back up the data folder first and run it when nobody is syncing.

### v0.14.0 — Group invite links, shared icons, skills and lores

- **Group invite links**: Campaign settings → *Invite links* makes one link for the whole group.
  It lasts 24 hours by default, or the hours, days, months or years you choose, or never expires;
  turn it off any time. People with it create an account, or sign in with theirs, and join as players.
- **Icons are stored once**: identical images are shared between worlds (each world still has its
  own list and only its members can load them). Sync Now reads and hashes icons in Foundry and only
  uploads images the website doesn't have yet, so a second world's first sync is much faster.
  Existing icons are merged automatically on upgrade.
- **Skills step fixed for dual class**: both classes' trained skills count, the larger class pick
  count applies, a background skill your class already trains gives an extra pick, and earlier picks
  that became automatic no longer block the last pick. Skills you choose, lores and automatic
  training are shown separately.
- **Lores**: add extra lores (they use a skill pick, as in Leveler); lore skill increases appear
  in level-ups.
- **Summary** shows your ancestry and class icons and names classes with their specialization
  ("Enigma Bard"). Level-up feat slots show where they come from: the class, second class or
  ancestry icon, and "Bard feat" / "Barbarian feat" with two classes.
- **Server admin** can delete accounts. In campaign settings, *Remove* only takes someone out of
  that campaign.

**Update the Bridge to 0.14.0** for the faster icon sync (0.12 still works).

### v0.14.1 — Generic examples

- Examples and placeholders use a generic address (`level-plan.mydomain.com`) instead of a real site.

### v0.15.0 — Import accuracy, free choice, deleting characters

Website only; the Bridge stays at 0.14.1.

- **Prerequisites see class features**: Perfect Encore (needs Magnum Opus, gained at 19) is legal at
  20. Specializations, heritage and background feats count too.
- **Pick anything, with a warning**: options the planner thinks don't fit are still hidden by
  default, but once shown they can be picked; the reason stays as a warning on the choice. Taking the
  same feat twice, learning a spell twice and repeating a formula stay blocked.
- **Pathbuilder import**:
  - Feats go into the slot Pathbuilder names (Ancestry Paragon, Free Archetype, class feat); the
    level-1 Paragon feat goes into the Paragon field instead of a hidden place.
  - Feats a dedication grants (Captain's skill feat) are noted, not put in a slot.
  - Pathbuilder doesn't record which level each skill was raised at, so increases now go to your
    highest skills first (Diplomacy and Performance before training extra skills). Check them.
  - Characters imported by 0.13–0.14 are repaired when opened.
- **Delete characters**: the character page has *Delete* for its owner and GMs.
- **+ Add a world** at the bottom of the campaign menu pairs a new Foundry world as a new campaign;
  campaign settings' code is for connecting another browser or address to that world.

### v0.15.1 — Player invitations are links

- A one-player invitation is now a link, `https://your-site/join?CODE`. Opening it checks the code
  and goes straight to creating the account (the code is then removed from the address bar).
  Pasting a code on `/join` still works.

### v0.16.0 — Foundry export reads the character itself

- **Export to Planner** (renamed from *Send to Planner*; the dialog button is now *Export to
  Character Builder*) reads the character as it is on its sheet: ancestry, heritage, background and
  class items, the boosts chosen on them including **alternate ancestry boosts**, level-1 and later
  free boosts, skill ranks, lores, feats by the slot they fill, spells and gear.
  Before, boosts and level-1 choices came only from Leveler's saved wizard data, which can be out of
  date after editing the sheet.
- PF2e Leveler's documents still add what the sheet doesn't record: wizard choices, formula grants,
  the plan for levels you haven't reached, and the skill increase you took at each level (used when
  it adds up to the sheet's skill ranks; otherwise increases are worked out from the ranks).
- The export dialog lists anything that didn't match your synced compendiums.

**Update the Bridge to 0.16.0** for the new export (0.15 and earlier still use the old export).

### v0.17.0 — Gradual boosts, known-only exports, GM extras

- **Gradual Ability Boosts** follow the rule: one boost at each of levels 2–5, 7–10, 12–15 and
  17–20, and four different attributes in each set. An attribute already boosted in the set shows
  the level it was taken at and can't be picked again.
- **Export to Planner sends only what's known**: the character-creation choices on the sheet
  (items, ancestry/background/class/level-1 boosts, languages, feats in their slots) and your
  PF2e Leveler plan (level boosts, skill increases, spells, grants). Later boosts, skill increases
  and spells aren't worked out from the sheet's final values any more; without a Leveler plan they're
  left for you to fill in. (PF2e stores a gradual set's boosts together, which is why a level-6
  character came across with four boosts at level 5.)
- **Extras from your GM** at every level 2–20: add bonus feats (any feat or feature in your
  compendiums) and extra skill increases. They count for prerequisites and skill ranks and are saved
  as Leveler's bonus feats and extra skill increases, so Leveler applies them on level-up.

**Update the Bridge to 0.17.0** for the export change.

### v0.18.0 — Extras from level 1, backups, audit fixes

- **"+" beside the next-level button** adds an extra feat or extra skill increase at any level,
  including level 1 (Leveler applies extras from level 2 on; add level-1 extras in Foundry).
- **Backups**: a verified copy of the database every 24 hours (Server admin → Backups, also *Back
  up now* and *Download*), the newest 7 kept in `/data/backups`. Set `PLANNER_BACKUP_HOURS`
  (0 = off), `PLANNER_BACKUP_KEEP` or `PLANNER_BACKUP_DIR` to change that. Copy backups off the server.
- **Pull from Planner** no longer moves an actor's link silently: if the Foundry character is linked
  to another build, it asks you to tick *Move the link here*. Leveler's flags are written first (put
  back if writing fails) and the website link is recorded only after that succeeds.
- **Safer server**: request bodies are capped while they're read; publishing a big sync no longer
  loads the whole catalog into memory and checks free disk space first; cleanup removes leftover sync
  digests; invite links "in 1 month" from 31 January end on 28/29 February.
- **Builds**: dependencies install from a committed lockfile (`npm ci`) in CI and Docker; CI also
  runs a dependency audit. Database upgrades and backups have their own tests.
- Never-expiring invite links show a warning.

**Update the Bridge to 0.18.0** for the safer Pull from Planner.

### v0.18.1 — Backups page fix

- Server admin failed to load: the backup API wasn't in 0.18.0's build because a `.gitignore` rule
  for backup folders also matched it. Fixed; CI now checks the backup API.

### v0.19.0 — Starfinder 2e, Runesmith runes

- **SF2e worlds sync**: the Bridge no longer refuses Starfinder 2e. Settings, languages, traits and
  reference packs come from the world's own system, and the website shows SF2e's Computers and
  Piloting skills. (PF2e with the Anachronism module already worked.)
- **Runesmith runes**: a *Runes known* card for Runesmith characters (removed again in v0.20.0).
- D&D 5e / 5.5: see the plan in `docs/DND5E_PLAN.md`.

**Update the Bridge to 0.19.0** and run Sync Now in SF2e worlds.

### v0.20.0 — D&D 5e planner

- **D&D 5e worlds** (2014 or 2024 rules, following the world's *Rules Version* setting): a separate
  Foundry module, **Planner Bridge (D&D 5e)**, pairs the world and syncs every installed Item
  compendium — SRD, purchased and third-party content alike (untick any under *Choose compendiums*).
  Players plan on the website: race/species, background, ability scores (standard array, point buy or
  manual), levels 1–20 with **multiclassing** (prerequisites checked), subclasses, ASI-or-feat,
  feature choices (Fighting Styles, invocations…), skills, expertise, languages and tools, spells per
  class from its spell list, and an equipment wishlist. Everything is read from the items'
  advancement data, so third-party classes work the same way. Content for the other edition is hidden
  until you tick *Show unavailable*. Plans stay on the website; nothing is exported to Foundry.
  Install from `https://raw.githubusercontent.com/Dwank-P/pf2e-planner/foundry-release/dnd5e/module.json`.
- **Runesmith rune planning removed**: Foundry has no clean way to apply it. Saved rune plans are
  dropped the next time a character is saved.
- Server admin → Accounts: the columns line up on every row.

**Update the PF2e Bridge to 0.20.0** (no functional change) and install the 5e Bridge in 5e worlds.

### v0.21.0 — Personal characters

- **My characters** (account menu): characters of your own, outside any campaign. Each one picks
  its game system (PF2e/SF2e or D&D 5e), its own variant rules, and its **sources**: systems and
  modules (grouped by compendium package, e.g. `pf2e`, `pf2e-battlezoo-ancestries`) from any world
  you belong to whose GM shares its compendiums — so Battlezoo from one world, another third-party
  module from a second and SF2e from a third can be used together. Nothing is copied: the character
  reads those worlds' current syncs.
- **GM switch**: Campaign settings → Compendiums → *Let members use these compendiums in their
  personal characters* (off by default).
- **Picks are kept**: if a world is disconnected, stops sharing, removes a player or drops a module
  in a re-sync, the items a character had picked from it are kept for that character; the rest is
  removed as usual.
- **Private by default**: GMs and the server owner don't see personal characters. Share with any
  account (view or edit), or make a **public link** that anyone can open without signing in. Public
  viewers see the build and the items it uses, but can't follow links in their text to other items.
- **Copy to campaign**: makes a normal campaign character, matching each pick against that world's
  compendiums (by ID, then name); anything it doesn't have is listed and left out.
- Server admin → Storage shows personal characters and kept items.

**Update both Bridges to 0.21.0** (no functional change).

### v0.22.0 — Personal rules, 5e builder polish

- **Personal characters choose every variant rule themselves**: Gradual Ability Boosts, Automatic
  Bonus Progression (rules as written or fundamental potency), Ancestral Paragon, Proficiency
  Without Level, Free Archetype, Dual Class, Mythic. The source worlds' settings baked into class
  data are undone and the character's applied instead. Copy to campaign reports rule differences
  and clears attribute boosts when the boost schedules differ.
- **Fixed: D&D 5e sources not offered** to the server owner in worlds they can open without being
  a member.
- **Fixed: spell choices such as Magic Initiate showed nothing.** The 5e Bridge now sends the
  world's class spell lists (update it and run Sync Now); the website also no longer reads dnd5e's
  empty restriction type as "feat", and offers any spell of the right level if lists are missing.
  Untitled choices get readable titles ("2 cantrips").
- **Character summary under 1180px wide** is a drawer opened from the button at the top right,
  instead of sitting under (and behind) the levels list.
- **D&D 5e builder**: origin groups are collapsible boxes that close once chosen; any level can be
  removed, or a level inserted before it (that class's later choices are renumbered); the class
  picker lists the character's classes first with a green "Level N in this class"; the summary
  shows species and class icons and marks each class's primary abilities.

**Update both Bridges to 0.22.0**; in D&D 5e worlds run Sync Now so spell lists reach the website.

### v0.23.0 — Sharing between accounts and planners

- **Personal characters use your campaigns' compendiums by default.** The campaign setting is now
  *Share these compendiums with every account on this server* (off by default): it opens the world
  to players outside the campaign. Turning it off keeps what their characters already picked.
- **Export and import builds between planners.** Every character has *Export* (a `.planner.json`
  file). *Import from another planner* (party page and My characters) takes that file or a public
  link from any planner; items are matched by ID, then by name and type, and anything this world
  doesn't have is listed and left out. The campaign's rules apply (differences are listed).
- **Campaign characters can have public links** too, like personal ones: read-only, no sign-in, the
  build's items only — and another planner can import the character from the link.
- **Name autocomplete** when sharing a character (campaign or personal) and when adding someone who
  already has an account to a campaign.

**Update both Bridges to 0.23.0** (no functional change).

### v0.24.0 — Choices inside feats

- **Feats and features that ask for a choice now offer it**, read generically from their PF2e
  ChoiceSet rule elements (as PF2e Leveler does) rather than case by case: Order Explorer's druid
  order, Skill Training's skill, Adopted Ancestry's ancestry, and so on. Options come from the
  ChoiceSet's own list, from the system's lists (skills, attributes…), or from the synced compendiums
  matched with the same filters Leveler uses (tags, traits, type, level, rarity…).
- **Picks lead to further choices**: when a pick is granted (a GrantItem of the chosen item, like the
  druid order itself), that item's own choices are offered underneath.
- Works for level-1 feats, feats at levels 2–20 and extra feats. Picks are stored where Leveler
  stores them (each feat's `choices`), so they reach Foundry with the rest of the plan. A feat with
  an unmade pick shows its level as partly done.

**Update the PF2e Bridge to 0.24.0 and run Sync Now** — it now sends each item's ChoiceSets.

### v0.25.0 — Equip gear

- **Equip button** (⛨) on armor, shields and items that give item bonuses in the equipment plan.
  One armor and one shield at a time; an item counts from the level it's planned for.
- **PF2e summary**: Armor Class (10 + Dex up to the armor's cap + armor proficiency + armor and
  potency rune bonus), and with a shield raised; item bonuses on Perception, saves (resilient runes)
  and skills — the highest bonus counts, conditional ones ("when climbing") aren't added; the armor
  check penalty when Strength is too low, and its Speed penalty. Automatic Bonus Progression's
  defense and save potency replace runes when that rule is on. Armor proficiency follows the class
  (Armor Expertise and similar raise it).
- **D&D 5e summary**: AC from worn armor (light adds Dex, medium caps it, heavy ignores it) and a
  shield; class features like Unarmored Defense aren't included.

**Update both Bridges to 0.25.0 and run Sync Now** — they now send armor, shield and item-bonus data.

### v0.26.0 — Weapons, runes and the AC badge

- **AC badge** beside the character's name, in a shield like Pathbuilder's: the worn armor's AC
  (a PF2e shield only counts when raised, so it isn't included). Hover for how it's made up.
- **Weapons**: equip any number; the summary shows up to three with their attack modifier and damage
  (PF2e: Str, or Dex for ranged and the better with finesse; proficiency in the weapon's category;
  potency; striking dice; Strength damage, half for propulsive. D&D: ability + proficiency if
  proficient + magic bonus). Hand rules aren't enforced.
- **Runes** on weapons and armor in the equipment plan: potency, striking or resilient, and property
  runes from the synced compendiums (up to the potency). The name shows them, e.g. "+1 Striking
  Flaming Longsword". D&D weapons and armor take a +1 to +3 magic bonus instead.
- **D&D Unarmored Defense**: without armor, a Barbarian's AC is 10 + Dex + Con and a Monk's
  10 + Dex + Wis (not with a shield); Draconic Resilience gives 13 + Dex.

**Update both Bridges to 0.26.0 and run Sync Now** — they now send weapon damage and range.

### v0.26.1 — Sync Now without a window

- **Sync Now** (both Bridges) no longer opens a window that couldn't be closed. It starts the sync
  straight away; "Sync started", the result and any error appear as notifications, and clicking it
  again while a sync runs says one is already in progress.

**Update both Bridges to 0.26.1.**

### v0.27.0 — Item stats, training, icons; icon sync fix

- **Fixed: "Sync failed — invalid_icon_batch".** The Bridge could put more than 100 small icons in
  one upload, which the website refused; the compendium data had already synced, but the sync
  reported failure. The website now accepts larger batches, the Bridges send at most 100 at a time,
  and icon problems are a warning rather than a failed sync.
- **Item details show stats**: armor (category, AC bonus, Dex cap, Strength, check and Speed
  penalties, runes), shields (AC bonus, Hardness, HP), weapons (damage, range, group, runes) and
  D&D armor and weapons, plus price, Bulk and usage.
- **Training** in the PF2e summary: armor (U, L, M, H) and weapons (U, S, M, A) with rank letters;
  hover for the full name and rank.
- **Icons** for Perception, saves and skills (game-icons.net, CC BY 3.0).

**Update both Bridges to 0.27.0.**

### v0.27.1 — Starting gear from the equipment plan

- **Level 1's Equipment card opens the equipment plan**, with new items going to level 1; the card
  shows how many items are planned for level 1.
- **Exporting to Foundry includes them**: the equipment plan's level-1 items (with quantities and
  prices) go into Leveler's Character Wizard as starting gear, so it adds them to the actor and
  returns the unspent starting gold. Items from later levels stay in the plan. Runes planned on
  them aren't applied by Leveler; add those in Foundry.

### v0.28.0 — Players in Foundry, Leveler plan files

- **Players can export and pull their own characters from Foundry**, without a GM online. On the
  website, the campaign page's **Connect Foundry** gives a one-time code; in Foundry, players paste
  it under *Settings → PF2e Planner Bridge → Connect my account*. The *Export to Planner* and *Pull
  from Planner* buttons on Leveler's windows then work for them: exports go to their own website
  account, and they can only pull characters they can edit onto actors they own. Players can't
  sync or change the world.
- **PF2e Leveler plan files**: a character's **Files** menu exports the level plan as a file for
  Leveler's *Import plan*, and imports one saved by Leveler's *Export plan* (replacing levels
  2–20; items are matched by ID, then by name, and any not in the compendiums are listed).
- **One "Import a character" card** on the party page; it asks whether it's from Pathbuilder or
  another planner.

**Update the PF2e Bridge to 0.28.0.**

### v0.28.1 — Leveler plan files as new characters

- **Import a character** (party page and My characters) now also takes a PF2e Leveler plan file
  (Leveler's *Export plan*). It becomes a new character named after the file, with the class the
  plan is for and levels 2–20 filled in; choose ancestry, background and the rest on level 1.
  (A character's *Files → Import Leveler plan* still replaces an existing character's plan.)
- Plan imports no longer list links inside feat descriptions as missing items, and no longer
  compare variant rules (plan files don't carry them).

### v0.28.2 — Import form layout

- The **Import a character** form's link field and file picker stay inside their card instead of
  spilling past its edge.

### v0.29.0 — Polish sweep

- **Backups**: the server owner sets how often backups run and how many are kept, on the admin
  page (the environment variables are now only defaults); lowering the count removes extras
  straight away. Single backups can be deleted, and a warning shows if the newest is overdue.
  Fixed: two backups in the same second no longer fail.
- **Account → Foundry connections**: see the Foundry browsers acting for you (GM pairings and
  player connections) and disconnect any you no longer use.
- **Equipment plan**: planned runes count in each item's price and the level totals (fundamental
  runes at their standard prices, property runes at the synced price).
- **Imports** from another planner or a Leveler plan appear in the list straight away.
- A friendly page for broken links and errors; red "Delete"-style links everywhere; the
  "My characters" breadcrumb only on personal-character pages.

### v0.30.0 — Pictures, origin summaries, item filters

- **Character pictures**: click the square beside a character's name in the summary to add a
  picture. A simple crop tool lets you drag and zoom to frame it; the website shrinks it to
  320×320 and compresses it (WebP, about 2–60 KB) before uploading. Pictures show on the summary
  and on character cards (party page and My characters). Changing or removing a picture, or
  deleting the character, deletes the old image from the server.
- The **AC shield** moved down beside Hit Points and Class DC to make room for the picture.
- **Details for ancestries, heritages, backgrounds and classes** now show the item's icon and a
  short summary: Hit Points, size, speed, vision, boosts and flaws, languages; for classes the key
  attribute, perception, saves, armor and weapon training, spellcasting tradition, trained skills,
  level-1 features and feat levels. D&D 5e species, backgrounds, classes and subclasses get the
  same (hit die, primary ability, saves, proficiencies, spellcasting, features).
- **Equipment filters**: picking Weapon in the equipment plan adds filters for category, damage
  type (versatile weapons count for both), damage die, hands, melee or ranged, group and trait;
  Armor adds category, AC bonus, Dex cap, Strength and group; Shield adds AC bonus and hardness.
  D&D armor and shields are now listed under Armor and Shield.

### v0.31.0 — Choose which compendiums the website offers

- **Campaign settings → Compendiums → Available on the website**: untick synced packs players
  shouldn't pick from on the website, even when PF2e Leveler offers them (animal companion
  ancestries, NPC options…). Packs are grouped by module with what each contains.
- Hidden packs leave every option list, search and the feat browser, for the campaign and for
  personal characters that use this world. They stay synced, so ticking one again takes effect
  without Sync Now. Characters that already picked something from a hidden pack keep it.

### v0.32.0 — Granted feats, features and proficiencies

**Update the PF2e Bridge to 0.32 and run Sync Now** — the website needs the new rule data.

- The website now follows what items grant, the way the PF2e system does in Foundry. Example: the
  cleric's First Doctrine grants whatever the chosen doctrine names, so Warpriest now gives Shield
  Block and Deadly Simplicity at level 1 and its Third Doctrine at 7. This covers ancestries,
  heritages, backgrounds, classes and their features, subclasses, deities and feats, including
  grants chained through other grants and items named rather than linked by id.
- Granted feats count for prerequisites, can't be picked a second time ("Already granted by …";
  an earlier pick of the same feat shows a warning), appear under "Gained automatically" on the
  level they arrive (level 1 included) and in the summary's new "Granted feats" list.
- The feat a background grants (Assurance, Lie to Me…) is blocked as a second pick too.
- Proficiency upgrades written as rules (armor and weapon training, saves, Perception, class DC,
  skills) now apply, with their conditions — e.g. Warpriest armor expertise only from level 13 with
  Divine Defense, Armor Proficiency, class archetype training.
- Feat choices also follow fixed grants: a feat that grants another item with its own choice now
  offers that choice, and shows "Grants …".
- Bridge: exports each character option's grant, actor-flag and proficiency rules (`ruleEffects`).

### v0.33.0 — Grants checked against the whole PF2e data set

**Update the PF2e Bridge to 0.33 and run Sync Now.**

- Tested against the real PF2e system data (every class and specialization, 669 granting feats,
  150 granting origins): e.g. Warpriest now shows Shield Block and Deadly Simplicity under
  "Gained automatically at level 1", with trained light and medium armor and expert Fortitude.
- Armor and save training that features give outright (PF2e `subfeatures.proficiencies`, how the
  Warpriest doctrine and many class features grant training) is now synced and applied.
- Level 1 lists everything gained automatically: the class's level-1 features plus all grants.
- Ancestries, heritages, backgrounds and specializations now offer their own choices (Able
  Carter's skill, Brevic Noble's lineage, Close Ties…), stored the way Leveler stores them; grants
  that depend on those picks follow them.
- Grants that depend on a pick's option, on which item granted them (Crossblooded Evolution's
  bloodline) or on a trained skill (Stonemason's Eye) now resolve.
- **Rules summary** at the bottom of every PF2e item's details: what it grants (choices shown as
  "X or Y", conditions such as "level 13+" or "if you pick Athletics"), what you choose, the
  training it gives and what it passes on to other features (a doctrine's First Doctrine). Items
  from a world synced with an older Bridge say so.
- Named references ("…Item.Shield Block") open from links and lookups.

### v0.33.1 — PF2e 8 (Foundry v14) grants

**Update the PF2e Bridge to 0.33.1 and run Sync Now.**

- PF2e 8 keeps actor flags under `flags.system` instead of `flags.pf2e`. The Bridge now exports
  both, so a Warpriest gets First Doctrine (Warpriest) → Shield Block and Deadly Simplicity, with
  trained light and medium armor and expert Fortitude, on Foundry v14 too. Checked against PF2e
  8.6.1's own data (182 class/specialization combinations, 831 granting feats).
- Features a specialization replaces (Battle Creed's doctrines, via PF2e `suppressedFeatures`)
  no longer show under "Gained automatically" or count for grants.
- The rules summary no longer shows "false" for a reference that isn't synced.

### v0.33.2 — Class feats need their class

- A class feat for a class the character doesn't have — for example after changing class — now
  shows a warning on its slot ("Fighter feat — this character is a Cleric"). The class slot needs
  the main class and the dual-class slot the second class; archetype feats stay open to all.
- The level list marks every level with a planned feat that no longer fits (wrong class, missing
  prerequisite, already granted…) with ⚠; hover it for the reasons.
- Level-1 feat picks show the same warnings.

### v0.33.3 — Large module icons

**Update the Bridges to 0.33.3 and run Sync Now.**

- Icons over the website's 256 KB limit were skipped — common for modules that use full-size
  artwork as class icons (e.g. PF2e Team+ Adventures' 0.7–1.1 MB class icons). Both Bridges now
  scale such images down in Foundry (to at most 256 px, keeping the file's format) before
  uploading, so they appear on the website.
