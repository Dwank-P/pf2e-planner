# Architecture

## Components

- `apps/web`: SvelteKit 3 + TypeScript; adapter-node container; eventual SQLite + Drizzle migrations.
- `apps/foundry-module`: Foundry v14 ES module running in the connected browser, usually a GM browser.
- `packages/shared`: versioned, stable JSON interchange schemas.
- One website, multiple campaigns, and one or more separately deployed Foundry worlds.

## Source of truth

| Data | Authority |
| --- | --- |
| Rules, packs, system settings | Foundry PF2e/SF2e and currently active modules |
| Creation/level plan import formats | Active PF2e Leveler |
| User accounts, memberships, notes, wishlists | Website database |
| Existing feats, inventory, actor spell state | Foundry actor snapshots |
| Planned future selections | Website plan data |
| Active content and restrictions | Last atomically accepted catalog revision per campaign |

## Planned flows

1. Site admin creates single-use pairing code; Foundry GM enters site URL and code.
2. Website registers world integration (server-assigned UUID) and campaign.
3. Authorized GM `ready` hook checks versions/content hashes; uploads only changed permitted data, then server atomically activates a catalog revision.
4. Player uses synchronized data to create/import character and maintain future-level plan, spells, equipment and wishlist, even while Foundry is offline.
5. Actor import and plan application are separate, explicitly authorized operations. GM reviews changes; Leveler/Foundry validates actual actor state.

## Critical limits

Foundry module code normally executes in a browser. Never put long-lived integration secrets into world settings readable by other players. Require safe browser authorization or a trusted server-side companion for truly unattended operation. Several PF2e rules rely on dynamic Foundry objects and RuleElements; browser planner must distinguish straightforward declarative validation from cases needing Foundry-side evaluation.

Selected compendiums must be chosen via active system profile/Leveler configuration, not blindly all installed packs. Disallowed and premium content should not be exposed in unauthorized player APIs.

## Consistency

- Stage/checksum a snapshot and swap only after the entire batch is valid.
- Deduplicate concurrent GM sync and retry by idempotency key.
- Character refresh merges authoritative actor state without destroying future plans or wishlist.
- Store compendium UUIDs, source pack, snapshot version and display fallback so removed modules don't silently corrupt plans.
- Preserve audit history of approved Foundry changes and provide backup/migration procedures.
