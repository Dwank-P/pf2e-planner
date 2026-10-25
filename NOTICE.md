# Third-party notices

## PF2e Leveler

Parts of this project follow, port or call the logic of
[PF2e Leveler](https://github.com/roileaf/pf2e-leveler) by RoiLeaf, licensed under the MIT License:

- `apps/web/src/lib/builder/creation.js`: Character Wizard document operations
  (field shapes and reset rules from `scripts/creation/creation-model.js`).
- `apps/web/src/lib/builder/schema.js`: wizard step order and visibility rules
  (`scripts/ui/character-wizard/index.js`), handler step lists and subclass tags
  (`scripts/creation/class-handlers/*`, `scripts/constants.js`) used as fallbacks.
- `apps/web/src/lib/leveler-progression.js`: per-level spell learning counts
  (`scripts/ui/level-planner/spells.js`, class handler `getSpellbookCounts`).
- `apps/foundry-module/scripts/leveler-adapter.mjs` imports the installed Leveler's
  own modules at runtime inside Foundry; no Leveler code ships with the Bridge.

Leveler's README states its MIT license. Copyright (c) RoiLeaf.

## Pathfinder Second Edition

Pathfinder and its rules are published by Paizo Inc. under the ORC License. This
project ships no compendium content: rules data comes from the user's own Foundry
world at sync time. Test fixtures use item names only, with short paraphrased
descriptions written for testing.
