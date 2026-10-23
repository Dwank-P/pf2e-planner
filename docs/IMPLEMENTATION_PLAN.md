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
