# PF2e Leveler compatibility

Upstream: https://github.com/roileaf/pf2e-leveler (inspect the actual deployed release during integration).

## Distinct contracts

- Character creation export: `scripts/creation/creation-model.js`; typically `{format:"pf2e-leveler-creation",version:1,data:{...}}`.
- Level advancement export: `scripts/plan/plan-model.js`; typically `{version:1,classSlug,dualClassSlug,levels:{...}}`.
- Do not conflate these schemas or assume parseable JSON guarantees valid import/application.

## Website storage (schema v2)

`character_builds.build_json` stores `{format:"pf2e-planner-character",schemaVersion:2,leveler:{creation,plan},planner:{modifiers,notes,extraFeats}}`, where `creation` and `plan` are Leveler's own documents (actor flags `pf2e-leveler.creation` / `pf2e-leveler.plan`). See `apps/web/src/lib/leveler-format.js`.

- The builder still edits a slot-keyed view (`class-2`, `skill-increase-3`, …). `projectView()` derives it; `applyView()` merges edits back, keeping any entry whose uuid is unchanged **verbatim** (Leveler's `choices`, `skillRules`, `grantedItems`, `toRank`, reminders, custom entries).
- New entries carry only `uuid/name/slug/level/traits`; Leveler back-fills feat metadata when its planner opens. New skill increases get an approximate `toRank` (trained baseline + earlier planned increases).
- Pre-v2 rows (bare view) are read as-is and converted on their next save or export.
- Foundry → website: "Send to Planner" uploads the Leveler documents verbatim, with actor-derived choices only filling gaps. Items from unsynchronized packs are kept and counted as `skipped`.
- Website → Foundry: "Pull from Planner" (GM, Leveler wizard/planner header) calls `characters/export`, links the build to the actor, then replaces `pf2e-leveler.plan` (and, only for actors without a class Item, `pf2e-leveler.creation`). Leveler ignores a plan whose `classSlug` differs from the actor's class; the dialog warns about this.

## Relevant code paths

- `scripts/classes/ensure.js`: derive standard progression from unknown class Items, but not necessarily bespoke class spellcasting and resource mechanics.
- `scripts/creation/class-handlers/registry.js`: specialized handlers for some official class mechanics.
- `scripts/plan/build-state.js`, `plan-validator.js`: depend on live Foundry actor, class definitions and game context.
- `scripts/plan/plan-model.js`: spells, spell swaps, signature spells, custom spellcasting entries, equipment, customEquipment.
- `scripts/apply/apply-manager.js`: applies equipment by resolving UUIDs and creating actor Items; **not** a purchasing/rune modification transaction.

## Required golden test fixtures

1. Standard Fighter level-2 class feat.
2. Wizard spellbook and prepared caster.
3. Spontaneous caster with signatures and swaps.
4. Fighter/Guardian dual class + Free Archetype.
5. Third-party class with a valid Foundry class Item.
6. SF2e caster and martial.
7. Existing actor with runes/inventory and multiple spellcasting entries.
8. Creation wizard starting spells and equipment.

Compare generated plans against real Leveler exports and verify **applied results on test actors**. Unsupported dynamic rules must be explicitly marked unresolved, not silently accepted.
