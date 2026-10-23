# Project specification — PF2e Planner

Baseline agreed 23 October 2026. Requirements are subject to validation against actual Foundry and PF2e Leveler exports.

## Objective and boundaries

One self-hosted Docker website serves multiple PF2e/SF2e campaign groups, created automatically when a GM pairs a Foundry world through the independently installable bridge module. Use the active PF2e/SF2e system, Leveler configuration and selected third-party compendiums as the rules/content source. Web character building works when Foundry is offline. An authorized GM login triggers sync, with a manual Sync Now fallback.

## Accounts and campaigns

- A campaign GM can generate a **one-time invitation code without choosing the new player's name**. The player visits /join, validates the code first, then creates their own username and password. Invites are not reusable; browser sessions are revocable. **No permanent bearer-link logins**.
- Admin authentication should be stronger (prefer passkeys). One user can participate in multiple campaigns.
- Campaign title defaults to synchronized world title with optional website override. Preserve world-local ID and independently generated stable integration UUID.
- Assign GM/player roles per campaign. Bind web characters to Foundry actors explicitly, not by matching names.
- Server enforces content and actor permissions; don't expose disallowed/paid content outside authorized campaign scope.

## Character features

- Create characters from level 1 **or** import existing Foundry actors including feats, class/subclass, skills, attributes, spells, equipment and existing Leveler data where present.
- Plan future levels up to 20, including class choices, skill increases, feats, boosts, Dual Class, Free Archetype, Ancestral Paragon and other active variants.
- Support standard custom class progression from Foundry class Items from the start. Detect, flag and progressively support bespoke mechanics and custom spellcasting.
- Separate current actor state from future selections. Refreshing an actor must not silently erase future plans.
- Provide browsable, filtered compendium content with source, rarity, level, traits and campaign restrictions.

## Spells

Handle prepared, spontaneous, innate, focus, archetype and dual spellcasting. Distinguish spellbook/known spells, repertoire, signature spells, spell swaps, future selections and saved daily prepared loadouts. Web planning exports Leveler-compatible fields where possible; daily-preparation application may require separate Foundry bridge operations.

## Equipment and wishlist

- Track **owned** inventory, **planned** future acquisitions and **wanted** wishlist items independently.
- Equip/configure planned weapons and armour, including constituent runes, level and cost, without granting items automatically.
- Per-character wishlist entries store item UUID, name fallback, item level, price, quantity, **separate optional target character level**, priority, notes and status (wanted/planned/acquired).
- Search/filter/sort/group wishlist by item level, target character level, price, priority and status. Display totals by level.
- Promote wishlist entries to planned equipment without losing notes; never mark acquired simply because character level increased.
- GM can view campaign wishlists; player-to-player sharing is optional.
- Keep fallback details for missing removed compendium entries.

## Plan import/export and safety

- Leveler creation and advancement plans are separate schemas; preserve class, dual-class, spells, archetypes, skills and equipment semantics.
- Plan changes never alter the live actor until an explicit authorized import/apply action.
- Prefer Foundry's rules engine for dynamic prerequisites/ChoiceSet/GrantItem evaluations; label unresolved choices instead of claiming full web validation.
- Validate real plan fixtures in a test world before applying production plans.

## Not first-release goals

Fully reproducing the Foundry PF2e rule engine, supporting every bespoke third-party class mechanic, unattended sync with no connected GM, or automatic gold deductions and rune transfers.

## First end-to-end acceptance criterion

GM pairs one world; site imports a small real Fighter/feat catalog; player makes a level-2 feat plan; a resulting plan imports and correctly applies to a **test actor** through the deployed Leveler version. Repeat for wizard/spontaneous spells before general release.
