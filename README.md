# PF2e Planner

Self-hosted PF2e/SF2e character creator and level planner with a companion Foundry VTT bridge.

**Status: scaffold / integration prototype.** The web app is a placeholder with a health endpoint. The Foundry module offers only GM-local, read-only diagnostics. Authentication, pairing, synchronization, database persistence and Leveler plan imports are **not implemented**. Do not expose this as a production service.

## Two independently deployable parts, one repository

- `apps/web`: Docker-deployed SvelteKit web application (future campaigns, characters, spells, equipment and wishlists).
- `apps/foundry-module`: Foundry VTT module (future automatic GM-login sync and actor/plan exchange).
- `packages/shared`: shared/versioned interchange contracts.
- `docs`: requirements, architecture, security and milestone plan.

## Local web development

Requires Node.js >=22.17; Node 24 recommended.

~~~sh
cd apps/web
npm install
npm run dev
~~~

Visit http://localhost:5173 and http://localhost:5173/health.

Alternatively, from repository root:

~~~sh
docker compose up --build -d
~~~

The preliminary Compose file binds port 3000 to **127.0.0.1 on the Docker host only**. Do not publish it to the internet before authentication is completed.

## Local Foundry development

Copy/symlink `apps/foundry-module` to `<Foundry user data>/Data/modules/pf2e-planner-bridge`, restart Foundry if needed, and enable **PF2e Planner Bridge** in a PF2e/SF2e world. Log in as GM and open the browser console:

~~~js
PF2ePlannerBridge.getWorldMetadata()
await PF2ePlannerBridge.previewItemPack('pf2e.feats-srd', 5)
~~~

The preview is local to the GM browser; it performs **no network synchronization**. Installed module code must go in the Foundry `modules` directory, not a world directory.

## Documentation

- [Project specification](docs/PROJECT_SPECIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Logical data model](docs/DATA_MODEL.md)
- [Pairing and sync contract](docs/SYNC_CONTRACT.md)
- [Leveler compatibility](docs/LEVELER_COMPATIBILITY.md)
- [Security](docs/SECURITY.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)

The active Foundry PF2e/SF2e system, [PF2e Leveler](https://github.com/roileaf/pf2e-leveler), and locally installed content remain the source of truth. No upstream code, paid books or copyrighted compendiums are bundled. This private repository has no selected public license.
