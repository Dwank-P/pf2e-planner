# Implementation milestones

## M0 — Repository bootstrap (this change)
- [x] One private monorepo; independent web and Foundry module sources.
- [x] Initial specifications, security notes and data contracts.
- [x] GM-only read-only Foundry compendium diagnostic.
- [x] Dockerizable SvelteKit web shell and health endpoint.
- [ ] Test installation and build in a real local environment.
- [ ] Commit a generated `package-lock.json` after dependency resolution.

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
