# D&D 5e (2014) and 5.5 (2024) character builder — plan

A character builder for Foundry worlds running the **dnd5e** system, using that world's compendiums.
It sits beside the PF2e/SF2e planner as a separate rules system: its own builder, document format and
rules code, sharing only the website shell (accounts, campaigns, sharing, icons, backups) and the
Bridge's pairing and sync.

## Why it's separate

PF2e/SF2e planning is built around PF2e Leveler's documents and schedules. dnd5e has no Leveler; its
class progression lives in the class items themselves (`system.advancement`). Mixing the two would
put `if (system === 'dnd5e')` throughout the PF2e builder, so 5e gets its own module:

```
apps/web/src/lib/systems/dnd5e/   rules, advancement reader, builder state, legality
apps/web/src/lib/wizard5e/        its step and level components
```

The campaign's `system_id` (already stored at pairing) picks which builder opens.

## What Foundry gives us

dnd5e (v4+) class, subclass, species and background items carry **advancement** data, which drives
the builder level by level, the way Leveler's schedule drives PF2e:

| Advancement | Used for |
|---|---|
| `HitPoints` | hit die and HP per level |
| `ItemGrant` / `ItemChoice` | features gained, and choices such as Fighting Style or Invocations |
| `AbilityScoreImprovement` | ASI-or-feat levels (and 2024 background ASIs) |
| `Subclass` | the level a subclass is chosen |
| `Trait` | skill, tool, language, armor and weapon proficiencies (fixed or "choose N") |
| `ScaleValue` | per-level numbers (Sneak Attack dice, Ki/Focus points, cantrips known…) |
| `Size` | species size |

The Bridge would export these alongside each item, as it already exports Leveler progression.

## Builder scope (first release)

- **Origin**: 2014: race + subrace + background; 2024: species + background (background gives the
  ability increases and an origin feat).
- **Ability scores**: standard array, point buy, or manual; plus ASIs.
- **Class levels 1–20** with **multiclassing** (prerequisites checked), subclass at its level,
  features listed per level, ASI-or-feat choices, `ItemChoice` picks.
- **Proficiencies**: skill/tool/language choices from `Trait` advancements, expertise.
- **Spells**: cantrips and spells known/prepared per class level, from class spell lists
  (dnd5e's spell-list registry where the world has it, else by spell `system` class data).
- **Summary**: HP, AC basics, proficiency bonus, saves, skills, spell slots (multiclass table).
- **Equipment plan** reuses the existing wishlist.

Not in the first release: exporting to a Foundry actor (dnd5e's advancement flow on an actor is
complex; a later phase could create the actor via the system's advancement API), homebrew rules
beyond what items' advancement describes, and character sheets.

## Bridge changes

- Recognise `dnd5e` worlds: no Leveler requirement; the GM picks which compendiums to sync (the pack
  picker returns for 5e, since there is no Leveler Compendium Manager).
- Export item types `class`, `subclass`, `race` (species), `background`, `feat`, `spell`,
  equipment types; with `system.advancement`, `identifier`, spellcasting progression, and the rules
  edition (`game.settings.get('dnd5e','rulesVersion')`: `modern` = 2024, `legacy` = 2014).

## Phases

1. Bridge 5e sync and campaign system routing; read-only catalog browsing.
2. Origin, abilities, class levels 1–20 with features, ASIs and subclasses (single class).
3. Multiclassing and proficiencies.
4. Spells and the spell-slot table.
5. Summary polish; optional export to Foundry.

## Questions to settle first

1. **Content**: only what's in the world's compendiums (SRD and anything imported, e.g. purchased
   content via D&D Beyond importers), or do you need anything outside Foundry?
2. **Editions in one world**: dnd5e can mix 2014 and 2024 content. Follow the world's rules-version
   setting only, or let each character choose?
3. **Bridge**: extend the same Bridge module (one install for every system), or a separate small
   module for 5e worlds? Recommendation: same module, system adapters inside.
4. **Export**: is "plan only, no export" fine for the first release?
