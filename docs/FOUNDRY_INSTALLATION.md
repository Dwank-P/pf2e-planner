# Installing and distributing the Foundry module

## Temporary public install from GitHub — v0.2.0 alpha prepared

The private monorepo now contains a dedicated `foundry-release` branch with a ready-to-install `module.json` and `module.zip` for **v0.2.0 alpha**. If you temporarily change the repo to public, Foundry can install it directly from this Manifest URL:

```text
https://raw.githubusercontent.com/Dwank-P/pf2e-planner/foundry-release/module.json
```

D&D 5e worlds install the separate **Planner Bridge (D&D 5e)** module (v0.20.0+) instead:

```text
https://raw.githubusercontent.com/Dwank-P/pf2e-planner/foundry-release/dnd5e/module.json
```

Steps:
1. Change repo visibility to **Public** in GitHub → Settings → General → Danger Zone.
2. In Foundry Setup, select **Add-on Modules → Install Module**, paste the manifest URL, click Install.
3. Confirm that the module appears. Then turn the GitHub repo back to **Private**.

**Tradeoff:** The module will stay installed after the repository becomes private, but GitHub's raw manifest and ZIP URLs will be inaccessible to unauthenticated Foundry. Automatic **update checks and updates will not work** until it is public again. Do not use a personal access token in the manifest URL.

**Privacy warning:** Temporarily publishing a private repository exposes its entire contents and history while public; someone can clone/fork it. Making it private again does not retract downloaded copies or public forks. Do not use this workflow with secrets in the repository.

This temporary-public workflow is intended for personal testing, not long-term distribution. The proper long-term alternative is a stable public **distribution-only** endpoint or repository, while keeping source private.

---
## Why the module.json in the private repository is not an install URL

The source manifest lives at `apps/foundry-module/module.json`. Foundry's **Install Module → Manifest URL** expects a URL it can access directly. It also needs that manifest's `download` field to point at an accessible ZIP package.

The source GitHub repository is **private**. A raw.githubusercontent.com URL or a private GitHub Release URL is therefore **not an unauthenticated distribution endpoint** for Foundry. Do not expose a GitHub personal access token in the manifest URL to work around this.

## Install now (developer/test version)

Copy the `apps/foundry-module` folder to the Foundry user data location:

```text
Data/modules/pf2e-planner-bridge/
  module.json
  scripts/main.mjs
  scripts/snapshot.mjs
```

Note: the source folder is named `foundry-module`, but the **installed** folder must be called `pf2e-planner-bridge` to match the manifest `id`.

Restart Foundry and enable **PF2e Planner Bridge** from the world's Module Management screen. This bootstrap module currently provides **GM-only read-only console diagnostics**, not pairing or automatic sync.

Alternatively, extract the provided `pf2e-planner-bridge-v0.1.0.zip` archive into Foundry's `Data/modules/` directory (the archive includes the top-level `pf2e-planner-bridge/` folder).

## Future: install directly from a self-hosted manifest URL

We will serve the distribution artifacts through the public HTTPS frontend, independently of the private GitHub source.

Run from the repository root (after selecting your actual public domain):

```sh
python scripts/build_module_release.py --base-url https://your-planner-domain.example/foundry --output apps/web/static/foundry
```

This generates:

```text
apps/web/static/foundry/
  module.json
  releases/
    v0.1.0/
      module.zip
```

The generated `module.json` contains correct absolute `manifest` and `download` URLs. Its downloadable ZIP contains the same patched manifest and the module scripts.

After deploying the web service and making those files publicly accessible over HTTPS at their generated URLs, Foundry can install the bridge using:

```text
https://your-planner-domain.example/foundry/module.json
```

**This URL is only an example, not an active installation link.** The site must actually be deployed with those files and reachable by Foundry's server.

For production, automate packaging in the web deployment/release pipeline, keep each versioned ZIP immutable and retain older releases so existing installs can update or roll back. Only module distribution assets should be public, not the private repository or authenticated planner APIs.

## Important limits

- This module has not been integration-tested in a running Foundry world.
- The hosted website is not yet secured for general internet access.
- Do not publish the web app prematurely simply to serve a development module.


## Current alpha validation

The web app has passed GitHub Actions: dependency install, SvelteKit checks, SQLite tests, production build and an HTTP smoke test of owner bootstrap, global-user invitation/redemption, pairing, metadata preview, refresh rotation/replay blocking, and revocation. The Foundry scripts passed Node syntax checks and the package-builder self-check. **The module's actual Game Settings dialog, CORS and Foundry v14 operation still require manual testing in a test world**. Do not import plans into a production actor yet.
