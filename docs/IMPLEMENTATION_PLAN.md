# Implementation milestones

## M0 — Repository bootstrap (this change)
- [x] One private monorepo; independent web and Foundry module sources.
- [x] Initial specifications, security notes and data contracts.
- [x] GM-only read-only Foundry compendium diagnostic.
- [x] Dockerizable SvelteKit web shell and health endpoint.
- [x] Foundry module installed and browser-console diagnostics tested in a PF2e world (web Docker build still untested).
- [ ] Test web Docker build in a local environment.
- [ ] Commit a generated `package-lock.json` after dependency resolution.

## Next Foundry module build notes
- [ ] Declare **PF2e Leveler** as a required Foundry module dependency in `module.json` (module ID `pf2e-leveler`); verify Foundry v14's install/enable dependency prompts in a clean test setup rather than assuming it silently auto-enables.
- [ ] Keep console output concise: show a compact readiness/pack-count summary rather than expandable full prototype trees.
- [x] Confirmed diagnostics from `pf2e-test-world`: PF2e system 8.6.1, PF2e Leveler 3.8.12 active, 34 Item compendiums including Battlezoo packs, and a successful Feats index containing 6,366 entries. This proves metadata/index access, **not** full content export or sync.
- [ ] Test the actual Leveler 3.8.12 plan fixture and compare against newer supported module versions; do not assume format compatibility across versions.

## M1a — Token-authenticated web and bridge foundation (unverified code)
- [x] Draft threat model and pairing/login/invitation token protocol in AUTH_AND_SYNC_V1.md.
- [x] Implement SQLite global accounts, Argon2id credential verifiers, cookie sessions, one-time player onboarding codes.
- [x] Implement GM directory/member assignment across campaigns, pairing codes, per-browser rotating refresh/access tokens.
- [x] Implement Foundry v14 dependency on pf2e-leveler, GM pairing dialog, IndexedDB and bounded core PF2e classes/feat preview sync.
- [x] Add GM website console for pairing and selecting new/existing users.
- [x] GitHub Actions passing: npm install, SvelteKit check, SQLite tests, production build, HTTP onboarding/pairing/refresh smoke test, Foundry JS syntax, release packager.
- [x] Stage v0.2.0 alpha `module.json` and ZIP on `foundry-release` branch for temporary-public Foundry manifest installation.
- [ ] **Manually** install/test v0.2.0 in a running Foundry v14 world; browser CORS/GM dialog/IndexedDB are NOT YET VERIFIED.
- [ ] Test authorization failure and race conditions; password recovery, session revocation UI and backup/restore.
- [ ] Perform production security review before exposing website to internet.

## M1 — First vertical integration slice
- [ ] Capture real Leveler creation and level-2 Fighter plan exports from test world.
- [ ] Version authenticated pairing request/response and SQL models.
- [ ] Implement one-time pairing code and safe credential lifecycle.
- [ ] Extract configured class and feat packs; support batch snapshot staging.
- [ ] Render Fighter and available level-2 feats on web.
- [ ] Export/import valid Leveler level-2 plan and test application to **test actor**.
- [ ] Repeat with wizard/spontaneous spell selections.

## M2 — Accounts and campaigns
- [ ] Admin auth, player invitation sessions, campaign membership and per-campaign roles.
- [ ] Multiple paired worlds; campaign auto-creation; duplicate world detection.
- [ ] GM-login auto-sync, manual Sync Now, permissions, hashes and atomic catalog revisions.

## M3 — Character builder
- [ ] Create new/import existing Foundry actor, link identity.
- [ ] Feats, skills, boosts, class features and levels 1–20.
- [ ] Dual Class, Free Archetype, ancestry variants and custom-class baseline.
- [ ] Conflict-aware actor refresh and versioned plans.

## M4 — Spells and equipment
- [ ] Prepared/spontaneous/innate/focus/archetype/dual spell planning and loadouts.
- [ ] Owned/planned equipment and future rune configurations.
- [ ] Per-character wishlist: item level, target level, cost, priority, quantity, notes and GM overview.

## M5 — Secure application and distribution
- [ ] Review/approval, direct Leveler-compatible application and integration tests.
- [ ] Independent Docker/Foundry packaging/release pipelines and database backup/restore.
- [ ] SF2e and third-party content compatibility test matrix.

Engineering rule: **no unpaired network sync; no public unauthenticated endpoints; no automatic actor modifications from wishlist or planning.**

## v0.2.3 usability iteration
- [x] No GM-selected display name; invite code generated directly.
- [x] Copy buttons for full player-facing invite and pairing code.
- [x] Two-step invitation: code validation without redemption, then password/username setup.
- [x] Fix normal player login state clearing on a GM-only roster 403.
- [x] Foundry config submenu only; URL/IP parsing, default HTTPS, clear errors.
- [ ] Browser E2E test with actual HTTPS proxy, Foundry v14 module UI and player logins.

## v0.2.4 — Verified ruleset receipt UI
- [x] On campaign home show received PF2e system version, Leveler version, counts, partial nature and last sync time.
- [x] Site owner/campaign GM detail page provides server-side persisted snapshot ID, SHA-256, source packs, class progression entries and searchable feat preview.
- [x] Separate summary endpoint (campaign members) and detailed endpoint (owner/campaign GM only); derive counts from saved SQLite JSON.
- [x] Foundry Test Website uses non-submitting in-dialog control; remains open with inline success/error feedback.
- [ ] Confirm in actual Foundry v14 that the dialog remains open after Test Website.
- [ ] Confirm website displays persisted snapshot counts from real Foundry world after Portainer v0.2.4 redeploy.

## v0.3.0 — Content import, variant settings and feat browser

- [x] Export actual PF2e variant settings from Foundry: Free Archetype, Gradual Boosts, ABP, Proficiency Without Level, Stamina and Mythic; plus Leveler Dual Class, Ancestral Paragon and restrictions.
- [x] Show variant settings and system version on campaign home and detailed ruleset page.
- [x] Module's Open Pairing Dialog includes **Sync Now** without pairing code and pack selection; website test remains in-dialog and does not close it.
- [x] Batch stage/commit authentic class and feat compendium Items and sanitized HTML descriptions; preserve prior published snapshot on incomplete transfer.
- [x] Feat browser search, filters (level, rarity, trait, feat category and pack), clickable details and related compendium links.
- [x] Token refresh during large uploads; suppress unchanged automatic GM-login transfers.
- [x] CI web build and HTTP smoke test for import, variant flags, filters, safe HTML and interrupted snapshot.
- [ ] Real Foundry v14 **manual** test against 6,000+ feats; measure batch import duration and UI responsiveness.
- [ ] Extend source selection/licensing policy and add scalable spells, ancestries, equipment and heritages.
- [ ] Rich inline @Check/@Damage/conditions resolution and supported actions (no untrusted macro execution).

## v0.3.1 — Rich PF2e descriptions and referenced content

- [x] Import **all Item types** from explicitly selected packs, not only class/feat Items.
- [x] Include installed official PF2e action/condition/effect Item packs automatically to resolve common core reference links.
- [x] Keep third-party Item compendiums **GM-opt-in**; enabled Foundry module alone does not mean import approval.
- [x] HTML-sanitize descriptions, parse rich PF2e text nodes with balanced brackets and render @Template, @Damage, @Check, @Action, @UUID and @Compendium references without executing rolls/macros.
- [x] Linked actions can resolve through an imported action Item slug; condition/effect UUID references resolve by imported Item UUID.
- [x] Display per-Item-type stored counts; show meaningful error if a referenced compendium was not included.
- [x] Add parser unit tests, security sanitization tests and HTTP smoke coverage of official/third-party references.
- [ ] **Manual Foundry v14 confirmation**, including the exact Kineticist example, selected Battlezoo packs and in-description navigation.
- [ ] Expand other inline syntaxes and optional action-system macro descriptions beyond imported standalone Item documents.
- [ ] Model advanced rule elements, actor-specific formulas and spell/equipment semantics for character planning; the browser does not execute Foundry effects.

## v0.4.0 — Functional character workshop and themed UI

- [x] Persistent character builds scoped by campaign and owner; revision-safe
  PATCH updates; ability modifiers, inventory and 1–20 level.
- [x] Ancestry, heritage, background and primary/secondary class Item selection.
- [x] Feat slots for ancestry/class/skill/general and Free Archetype variants,
  using imported class advancement arrays where present.
- [x] Deep searchable feat/item picker (rarity, source pack, level cap, category,
  trait, searchable names and slugs).
- [x] Level-specific supported inline damage dice formula evaluation
  using a safe arithmetic parser (no eval, rolls or macros).
- [x] Hover previews, clickable inline Item references, Back and Ctrl/⌘-click
  popup Item details.
- [x] Responsive dashboard redesign and four persistent dark/light themes.
- [x] Separate Foundry v14 GM settings menus for Pair, Sync and
  searchable grouped Compendium Collections, core selected by default.
- [x] Character REST endpoint regression coverage and formula unit tests.
- [ ] Manual Foundry v14 check of three settings submenu classes.
- [ ] Manual HTTPS/browser check of character builder, autosave and popouts.
- [ ] Complete prerequisite evaluator, ancestry boosts and skill proficiencies.
- [ ] Full class mechanics, equipment statistics, spell preparation and leveler
  Dual-Class/Free Archetype exceptions before calling it a validated character sheet.

## v0.4.1 — Builder usability and metadata completion
- [x] Small-screen fixed modal Item Inspector.
- [x] Exact ancestry/heritage UUID and slug metadata; versatile heritage flag.
- [x] Compatible heritage filter with explicit show-incompatible override.
- [x] Conservative feat issue indications and preference sorting, rather than
  rejecting homebrew/illegal choices.
- [x] Background OR ability boosts, trained skills and granted feat filtering.
- [x] Class progression, starting saves, Perception and key attribute details.
- [x] Spellcasting-class spell repertoire UI with imported tradition/level data.
- [x] Add reusable eligibility/unit checks and HTTP catalog-filter smoke tests.
- [ ] Comprehensive PF2e legality engine for ancestry-adopted feats, archetype
  dedication lockouts, class-specific feat requirements and feature gates.
- [ ] Full class-specific spell-slot table, focus spell pools, prepared casting,
  signature spells and automatic bonus progression.

## v0.5.0 — Refactor around Leveler

- [x] Inspect PF2e Leveler upstream `classes/progression.js`,
  `classes/registry.js`, `classes/ensure.js`, `plan/build-state.js`,
  `plan/plan-validator.js` and `creation/creation-model.js`.
- [x] Dynamically import installed Leveler's real `ClassRegistry`,
  `ensureClassItemRegistered` and `getChoicesForLevel` **inside Foundry**;
  serialize progression by class and level at sync time.
- [x] Retain Leveler's world variant scheduling, including
  Free Archetype, Dual Class, Ancestral Paragon, Mythic, gradual boosts,
  skill increases, spellcasting and ABP.
- [x] Website uses Leveler-imported slots instead of fabricated periodic
  default schedules. Existing old import clearly prompts GM for re-sync.
- [x] Integrate Level 1 boost sources + per-level attribute choices into
  the same flow as feats; persist boosts and skill increases, not merely
  editable raw ability modifiers.
- [x] Read spell ranks/slots from Leveler's class spellcasting definition
  where available.
- [x] Regression-test exported progression metadata, ability boosts,
  dual-class options and skill increases.
- [ ] Connect Leveler's actor-dependent `computeBuildState`,
  `checkPrerequisites`, `validatePlan`, class creation handlers and
  item/feat grant application through an authorized Foundry-side validation
  service. Do not claim full rule parity before this is operational.
- [ ] Manual Foundry integration check for current installed Leveler version,
  selected third-party class packs and existing characters.

## v0.6.0 — GM-selected content and character integration

- [x] Use Leveler's runtime Compendium Manager category selection
  rather than treating all enabled third-party packs as available content.
- [x] Preserve Leveler GM disallowed content restrictions at import time
  and recommended/not-recommended status for feat ranking.
- [x] Content-addressed SHA-256 **pack-level** incremental sync; server-side
  copy-on-import for unchanged packs; transactional publication and digest DB.
- [x] Add GM-only character import button to Leveler wizard/planner V14
  ApplicationV2 windows; searchable Foundry Actor selector and website
  campaign player assignment, no new pairing code.
- [x] Persist explicit actor/website links, avoid duplicate character
  creation, don't overwrite website edits without explicit opt-in.
- [x] Show Level 1 creation boosts before class selection; use
  class key ability/background boost restrictions where available.
- [x] Stronger ancestry-feat trait lockout detection with 3p ancestry tags.
- [ ] Validate real Leveler window hook injection and actor plan projection
  in Foundry v14 (CI cannot run Foundry GUI).
- [ ] Implement Leveler actor-backed full build-state and prerequisite
  validation plus creation wizard class-specific spell/feat choice steps.
- [ ] Optional per-Item delta inside changed packs to further cut uploads.

## v0.6.1 creation wizard preservation
- [x] Import un-applied Leveler Character Wizard `this.data` selections,
  avoiding a misleading empty Actor import before the wizard is applied.
- [x] Preserve selected class-specific wizard choices in a structured,
  bounded field (not arbitrary actor flags or private notes).
- [x] Display Leveler class-specific imported selections read-only on the
  website; expose spell and starting boosts in their standard selectors.
- [x] Let GMs map a Foundry actor to the website player's actual account.
- [ ] Integrate Leveler's editable class-specific creation handlers and
  full spell preparation into the web character builder.

## v0.7.0 Leveler-native storage and Pull from Planner
- [x] Store builds as Leveler creation/plan documents; keep unchanged entries verbatim.
- [x] Import Leveler documents from Foundry; actor-derived choices fill gaps only.
- [x] GM **Pull from Planner** writes `pf2e-leveler.plan` (creation only for uncreated actors).
- [x] Download plan/creation in Leveler's import formats.
- [ ] Validate Pull from Planner and level-up application in a Foundry v14 test world.
- [ ] Let actor owners (players) pull their own builds without GM bridge credentials.

## v0.7.1 builder fixes
- [x] Origin (level 0) step; levels show only their own choices.
- [x] Level-1 subclass, class feat and skill feat slots from Leveler/class Item data.
- [x] Automatic class features per level.
- [x] Boost slots never replace earlier picks.
- [x] Per-level spell learning limits (Leveler rules); spells stored at the level learned.
- [ ] Class-specific creation steps beyond subclass (deity, implement, kinetic gate, …).
- [ ] Granted/curriculum spells reducing level-1 picks (Leveler resolves these in Foundry).

## v0.8.0 redesign (phases 1–3)
- [x] MIT licence, design system, sign-in/setup, party, campaign settings.
- [x] Catalog downloaded once per sync and searched in the browser.
- [x] Character Wizard with class-driven steps and live summary.
- [ ] Phase 4: Level Planner rebuild and Leveler rules engine for prerequisites.
- [ ] Phase 5: sign in from Foundry; retire invitation codes.
