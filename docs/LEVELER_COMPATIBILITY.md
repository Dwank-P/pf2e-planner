# PF2e Leveler compatibility

Upstream: https://github.com/roileaf/pf2e-leveler (inspect the actual deployed release during integration).

## Distinct contracts

- Character creation export: `scripts/creation/creation-model.js`; typically `{format:"pf2e-leveler-creation",version:1,data:{...}}`.
- Level advancement export: `scripts/plan/plan-model.js`; typically `{version:1,classSlug,dualClassSlug,levels:{...}}`.
- Do not conflate these schemas or assume parseable JSON guarantees valid import/application.

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
