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
