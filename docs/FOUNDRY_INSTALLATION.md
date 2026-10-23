# Installing and distributing the Foundry module

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
