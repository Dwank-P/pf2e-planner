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

## H. Pairing UI introduced in module v0.2.2

The prior module exposed only a **Website URL** setting in the Foundry settings
dialog. This was not the pairing-code entry point: it never submitted a code,
so saving the URL alone left `integrationId` empty and the website without campaigns.

In Foundry v14, open **Game Settings → Configure Settings → PF2e Planner Bridge →
Open Connection Settings**. The new native settings submenu has **Website URL**,
**One-time pairing code**, **Test Website**, and **Pair & Sync** buttons. Test
checks `GET /api/v1/bridge/status` with a ten-second timeout, validates the
returned service identity/version and reports success/failure via Foundry toast.
Pair checks the endpoint before consuming a code. Existing saved URLs are
displayed but cannot silently constitute a pairing. The website must also be
updated to v0.2.2 for the status-check endpoint.

DevTools GM console fallback: `PF2ePlannerBridge.openPairingDialog()`,
`PF2ePlannerBridge.testWebsite('https://level.dwank.uk')`,
`PF2ePlannerBridge.status()`. Never paste or report live pairing codes or
access/refresh tokens in diagnostic messages. The actual sync remains a limited
preview; browser/Foundry v14 UI still requires real-world verification.

## I. Simplified invitation flow (v0.2.3)

GM → Campaign → Players → **Generate invite code**: creates a one-use code
without asking the GM to name the player. The site displays a **player-facing
invitation message** with join URL and code and a copy button. Never log or
share the code in a public channel.

Player → /join → **Step 1: enter/validate code** (POST /api/v1/join/validate,
no consumption). **Step 2: choose username and password** (POST
/api/v1/join/redeem, consumes exactly once). The chosen username initially
becomes the user's display name. A validation can expire before step 2, so
redemption revalidates atomically.

The GM still sees a pending "Invited player" membership until code
redemption. Previously generated invitations with pending display names remain
valid. Existing account addition works as before.

## J. v0.2.3 manual browser and Foundry UI regression

- Sign in as a **normal player** (not GM). Confirm that the dashboard stays
  signed in after reload even though the GM-only members endpoint would
  respond 403. Previously a shared error handler treated roster failure as
  authentication failure and returned players to the login screen.
- Sign in as GM, generate an invitation with **no display-name input**.
  Use the copy icon to copy the **player-facing message** and verify it
  contains /join and a one-time code.
- On /join, first verify the code, then choose the username/password.
  Confirm the new user remains logged in, and a second redemption fails.
- Generate a Foundry pairing code and test its copy icon.
- In Foundry, only **Open Pairing Dialog** should appear in Planner Bridge's
  module settings (not a separate editable website URL). Test `level.dwank.uk`
  and `192.168.1.40`: both should normalize to HTTPS URLs automatically;
  HTTP should work only for localhost/127.0.0.1. Invalid inputs should
  produce actionable notifications and must not persist.
- Foundry v14 native DialogV2 behavior, reverse-proxy HTTPS connectivity,
  and real-world import still require manual verification; GitHub CI exercises
  JS syntax, URL parsing and backend smoke tests, not Foundry UI rendering.

## K. v0.2.4 — Visible received content and Foundry dialog test

After website redeploy, sign in and select a campaign. The home screen shows:
**system/version, Leveler version, saved class and feat counts, partial-preview
warning and last received timestamp**. GM/owner can open **View received data &
sync details**, which shows snapshot ID/SHA-256, compendium source counts,
exact class progression arrays received, and a searchable/paginated sample of
up to 1000 feat metadata entries. All counts come from the site's persisted
catalog_previews.data_json row, not from the module's notification alone.

`GET /api/v1/campaigns/{id}/catalog-summary` is membership-scoped and omits
the full entries. `GET .../catalog-details` is GM/owner-only; a player
must receive 403. When no preview is saved, show "No snapshot yet".
The 1000 feat limit is deliberate and is NOT the full PF2e feats catalogue.

In Foundry module v0.2.4, open the Pairing Dialog and click **Test Website**.
It is a non-submit button INSIDE the form content, so should display the result
inline and keep the dialog open with the entered URL/code intact. Entering a
code and pressing Pair & Sync is still a separate explicit action.

Automated CI validates read endpoints and role restrictions, build and script
syntax, but cannot prove the remote live DB contents or Foundry dialog behavior.

## L. v0.3.0 live Foundry and full compendium import

1. Update Docker/Portainer and Foundry module, verify both show v0.3.0.
2. Open Foundry as the **same GM browser** previously authorized. Open **Configure Settings → PF2e Planner Bridge → Open Pairing Dialog**. Click **Sync Now (no code needed)**; **do not generate another pairing code**. A saved refresh credential is required on that browser.
3. Expand **Compendium packs to import** and approve optional third-party content only if campaign members can legally access it. Core `pf2e.classes` and `pf2e.feats-srd` are always included. Selected additional packs can be saved at sync time.
4. The bridge reads Item documents and uploads batches of at most 15 items; expect multiple progress notices. Changing packs, system version or variant settings triggers a new automatic sync on next authorized GM login; manual sync always forces one.
5. Website campaign should show PF2e system/Leveler version, **Free Archetype**, **Dual Class** etc. with actual values from Foundry, counts from SQLite and last sync time. The GM ruleset details page includes a link to the feat browser.
6. Open **Browse imported feats**. Filter by feat name, level, rarity, type, traits or source pack. Click an entry and check HTML description, prerequisites and linked `@UUID[Compendium....]` documents. Linked items must only open if present in this campaign's synchronized catalog; absent links show an informative error.
7. Re-sync with one optional feat compendium added and verify its feat counts and filtered source appear. Confirm older successful snapshot remains visible if a later import is interrupted.
8. Browser DevTools can inspect CORS/network errors if sync fails; **never share access tokens, refresh tokens or pairing codes**.

Limitations: Foundry v14 live tests are pending; the full import covers only selected class/feat Items, not every Item type. Inline PF2e skill checks, die rolls, spells, effects and condition links are not interactive yet.

## L. v0.3.1 reference-rich import checks

This is an update to the existing v0.3.0 full-import protocol, not a database
reset. Keep the SQLite volume intact.

1. Update web **v0.3.1** and Foundry Bridge **v0.3.1** together.
2. In Foundry **Open Pairing Dialog → Compendium packs to import**, inspect
   all additional **Item** packs. Official PF2e action, condition and effect
   packs are automatically included. Third-party packs (e.g. Battlezoo) are
   **not** included just because their source module is enabled: check each
   relevant third-party Item pack explicitly and click **Sync Now**.
3. The website ruleset detail panel lists actual saved item types and counts,
   including actions/conditions/effects and selected third-party feats.
4. In the feat browser, inspect a feat with this description:
   `@Template[line|distance:60]`,
   `@Damage[(floor((@actor.level -1)/2) +2)d4[slashing]|options:area-damage]`,
   `@Check[reflex|against:kineticist|basic|options:area-effect]`.
   They should display styled area, damage formula and saving-throw tokens.
   Actor-dependent formulae are **not** rolled or resolved on the website.
5. Clicking `@UUID` or `@Compendium` references should show linked Item
   details for imported actions, conditions, effects and other types.
   `@Action[slug]` attempts lookup of an imported action by its slug.
   If the target is not synchronized or is a Foundry-only macro, the dialog
   explains this rather than silently doing nothing.
6. If third-party content still does not appear, check whether the module
   provided actual **Item compendium packs** and whether each pack was checked
   before sync. Actor/Journal compendiums and dynamic data registered outside
   `game.packs` are not part of the Item snapshot.
7. Verify permissions: selected third-party packs should only be synchronized
   when every campaign user who can browse them is authorized to view that
   content. The planner's authenticated membership currently allows all
   campaign members access to the explicitly selected compendium data.

## M. v0.4.0 — Character workshop acceptance checklist

1. Update the Docker site to v0.4.0 using existing SQLite volume and Foundry
   module to v0.4.0 from its release manifest.
2. Select a campaign → **Open character builder** → create a level-1 hero.
   Choose ancestry, heritage, background and class using imported Item packs.
3. With Free Archetype and Dual Class enabled in Foundry, confirm the campaign
   reports them and the builder presents appropriate extra controls.
   Verify GM ruleset flags are not guessed when absent.
4. Set character level 10, select a feat and revisit the character after
   refreshing the browser; ensure name, level, feats and equipment persist.
5. Filter feats by rarity, trait, source, category and level. Test Battlezoo
   Dragons only after selecting that third-party collection in Foundry.
6. Test the Kineticist example at level 1 (2d4), level 10 (6d4), and
   level 20 (11d4). These are displayed counts, NOT applied effects.
7. Hover an imported @UUID compendium link: preview is shown. Click to open
   details, Back returns. Ctrl-click opens a separate popup/tab.
8. Change the color theme and reload; verify saved preference applies
   across dashboard, signup, feat browser and character workshop.
9. In Foundry Configure Settings → Bridge, confirm three buttons:
   **Pair World**, **Sync Now**, **Select Compendium Collections**.
   Test website should not close the pairing window; collection search should
   select whole module/package groups; default PF2e content is checked.
10. Confirm character CRUD security: player owns a build; another ordinary
   player cannot read or overwrite it; GM/site owner can manage campaign builds.

Automated CI exercises Svelte compilation, production API smoke tests, server
database transactions and level-expression parsing. Full Foundry v14
application behavior and real third-party modules require manual verification.

## N. v0.4.1 manual browser checks

Use an existing test world with an Anadi ancestry and a Bard. Update the website
and Bridge and **Sync Now**. The importer now extracts new fields; without the
re-sync the site cannot know an imported heritage's source ancestry.

1. On a phone viewport <700px, open Details while choosing a feat; verify
   description overlays the current view rather than appearing below it, then
   close via the X without losing the picker state.
2. Choose Anadi: Adaptive Anadi should appear; Abyssal Merfolk must be absent
   unless **Show incompatible heritages** is checked. Selecting it after
   override must preserve the selection and flag it red.
3. Select Bard: Bard-tagged class feats should be presented ahead of
   Fighter-tagged class feats. Deliberately select a Fighter feat and verify
   the warning persists; an enigma-muse-only Bard feat should be flagged
   as requiring prerequisite verification.
4. Filter backgrounds by STR or CON; options with either constrained boost
   appear. Backgrounds matching only through their free boost should NOT
   appear. Filter by skill and granted feat to confirm both operate.
5. Expand Bard class details; confirm key attribute CHA, trained/expert saves
   and level schedules agree with imported class fields.
6. Open Spells for Bard, compare cantrips and rank-1 occult spells. Select
   Soothe, save, refresh, and verify the chosen spell persists.
7. Confirm selected spells outside the imported catalogue still fail backend
   reference validation. Automatic repertoire limits and every prerequisite
   are not enforced yet.

## N. v0.5.0 — Leveler-powered progression smoke

1. Update both Docker site and Foundry module to **v0.5.0**. Keep existing
   website database and pairing; no character migration/drop is needed.
2. In Foundry configure the campaign's Free Archetype, Dual Class,
   Gradual Ability Boosts or other variants, then use **Sync Now**.
   The module should report how many Leveler class advancement schedules
   were exported. If Leveler changed its internal module layout, the bridge
   should fail with an actionable error rather than fabricate progression.
3. Open a class's synced item detail in the API or character workshop.
   Its metadata should include `levelerProgression.provider =
   "pf2e-leveler"`, version, and `levels` choice arrays.
4. In the character's **Progression** tab, choose level 1 and confirm
   Ancestry, Background, Class and Free ability boosts are interleaved
   with the ancestry feat. There must be NO separate Attributes tab.
5. Levels 5/10/15/20 should use Leveler Boost choices; under gradual
   boosts the class's Leveler schedule should instead distribute them.
   Dual Class, Free Archetype and Mythic slots must match Leveler results
   exported at synchronization time.
6. Save and reload, confirm planned boosts, skill increases and feat
   selections persist. Spellcasters should show Leveler spell-rank slot
   progression where the class definition provides it.
7. Verify advanced prerequisites, skill rank maximums and Level 1
   source-boost legality are labeled as **not yet actor-validated**.
   The website must not represent heuristic results as Leveler's own
   prerequisite decisions.

CI can test the pure website projection and persisted model, but cannot
test Foundry's live module imports without a Foundry v14 world and the
actual installed PF2e Leveler modules.

## O. v0.6.0 — Incremental and Leveler content test

1. Update website and Bridge to v0.6.0. Back up SQLite before initial
   migration. Old module v0.5 sends a legacy manifest and cannot sync
   against the new server until updated.
2. Check PF2e Leveler's own Compendium Manager: select your Battlezoo Dragons
   Item packs **there**, or explicitly add them in Planner's collection
   selector. Choose content you are authorized to distribute. Sync Now.
3. The first v0.6.0 sync sends the full selected catalog; the next sync
   with no content/config changes should upload 0 Items. Changing one
   pack should upload that pack only; the website copies all other
   Item rows from the last published version inside a transaction.
4. Mark a test feat disallowed in Leveler's GM Content Guidance, resync,
   verify it is absent on the website. Change to not-recommended and
   verify its label and position. No unrelated packs should re-upload.
5. Open PF2e Leveler's Character Wizard and Level Planner as **GM**. Look
   for **PF2e Planner** in the application header. Select a world Actor,
   then its website player, and Import & Open Character Builder.
6. Confirm repeat imports return the existing linked character. Only
   selecting the overwrite checkbox should replace its website choices.
   Confirm an imported player-owned character is visible in that player's
   website account and not in unrelated users' accounts.
7. Confirm level 1 has Boost choices adjacent to feats even before a class
   is chosen; class key ability restrictions update when selecting class.
   Check level-dependent boosts, spell slots and ancestry lockout indicators.
8. Critical limitation: GM actor sync imports **only supported choices**;
   it does not serialize the complete internal Leveler actor document.
   All ability boosts, class-specific selections, trained skills, ancestry
   exceptions and prepared spells still need Leveler's full actor-backed
   validation for definitive build legality.

## P. v0.6.1 — Live Leveler Wizard handoff

As GM, open the Leveler **Character Creation Wizard** on a PC before
applying changes. Select class, background, ancestry, boosts, level-one
feats, deity or subclass and spells. Click **PF2e Planner** in its header.
Choose the same actor and website member, import, and open the resulting
character. Verify the wizard's un-applied choices and specialized
creation selections are preserved even if they were absent from the
original embedded Actor. The advanced class-specific selections are
shown as read-only imported metadata until the website supports editing.

## Q. v0.7.0 — Pull from Planner round trip

Update Docker/Portainer and the Foundry module; both must report v0.7.0.
1. As GM, open Leveler's **Level Planner** on a test PC and click
   **Send to Planner**. Open the website build: feats, boosts, skill increases
   and spells should match the planner, and **Leveler ▾** should offer both
   downloads.
2. On the website, change a level-2+ feat and a skill increase, then wait for
   *Saved*.
3. Back in the planner, click **Pull from Planner**, choose the same actor and
   the linked build. The preview shows planned levels/feats; warnings appear if
   the plan's class differs from the actor's class.
4. Pull. The planner window reopens showing the website changes. Unchanged
   feats keep their Leveler choices.
5. Level the actor up and confirm Leveler offers to apply the pulled level.
6. Pulling a build linked to another actor requires ticking the relink box.

## R. v0.7.1 — Builder level-1 and spell checks

After updating both parts to v0.7.1, run **Sync Now** as GM (the export gained
class features, `otherTags` and level-1 spell counts).
1. Create a build: it opens on **Origin**; levels show only their own choices.
2. Pick a class with a specialization (e.g. Wizard): level 1 shows
   *Class specialization*; the picker lists only that class's options.
3. Pick a class with a level-1 class feat (e.g. Fighter): level 1 shows a class feat slot.
4. Each level lists *Gained automatically* features from the class Item.
5. Fill a 4-boost slot, then click a fifth attribute: nothing changes until one is deselected.
6. Sorcerer: level 1 allows 5 cantrips + 3 rank-1; level 2 allows 1 rank-1;
   level 3 allows 3 rank-2 (Leveler's slot growth). Wizard: 10 + 5 at level 1,
   then 2 of any castable rank per level. Cleric: no spell slots on the track.
7. In Foundry, the Send/Pull buttons appear left of the Leveler window's close button.

## S. v0.8.0 — Redesigned party, settings and Character Wizard

Update Docker and the Bridge to 0.8.0, then run **Sync Now** as GM.
1. Sign in: you land on the party screen of your last campaign.
2. Campaign settings (GM): versions, variant rules and packs match Foundry.
3. New character → wizard. Fighter: level-1 class feat under Feats. Wizard:
   *Wizard specialization*, *Arcane thesis* and *Spells* (10 cantrips + 5 rank 1).
   Cleric: *Deity*, then sanctification/divine font only if the deity needs them.
4. Boosts: a full row disables further picks; background enforces its two listed attributes.
5. In Foundry, *Pull from Planner* on that actor: Leveler's wizard shows the same choices.

## T. v0.9.0 — Levels 1–20 in one builder

Update Docker and the Bridge to 0.9.0, then run **Sync Now** as GM.
1. Open a character: the rail shows level-1 steps then levels 2–20, each with its picks written out.
2. Level 2 skill feat: only feats whose skill prerequisites you meet are listed; *Show unavailable*
   reveals the rest with reasons (e.g. "Needs Trained in Medicine").
3. Plan Medicine as a skill increase at level 3: Medic Dedication becomes available at level 4.
4. Level 5 boosts: an attribute at +4 shows a partial boost (½); a skill already Expert is capped
   ("Max Expert at level 5") until level 7.
5. Background step: tick STR, pick a trained skill, or type a granted feat to filter.
6. Languages: tick *Show uncommon*/*Show rare*; nothing is blocked by rarity.
7. Go back to Class or Ancestry after planning later levels: choices stay editable, and later feats
   that no longer fit show a ⚠ reason instead of disappearing.
