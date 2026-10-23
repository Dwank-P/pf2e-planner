#!/usr/bin/env python3
"""Build a Foundry-installable manifest and versioned ZIP for a public HTTPS host.

Usage: python scripts/build_module_release.py --base-url https://planner.example/foundry
The given URL must serve the generated output directory contents. This script
never uploads or publishes anything, and does not require GitHub credentials.
"""

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile


def build_release(module_dir: Path, output_dir: Path, base_url: str) -> tuple[Path, Path]:
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("--base-url must be a public HTTPS URL without credentials, query or fragment")
    base_url = base_url.rstrip("/")

    source = module_dir / "module.json"
    manifest = json.loads(source.read_text(encoding="utf-8"))
    module_id = manifest.get("id")
    version = manifest.get("version")
    if not isinstance(module_id, str) or not module_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in module_id):
        raise ValueError(f"Invalid module id: {module_id!r}")
    if not isinstance(version, str) or not version or "/" in version or "\\" in version:
        raise ValueError("Invalid module version")

    manifest.update({
        "manifest": base_url + "/module.json",
        "download": base_url + "/releases/v" + version + "/module.zip",
    })
    data = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    archive = output_dir / "releases" / ("v" + version) / "module.zip"
    output_manifest = output_dir / "module.json"
    archive.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_bytes(data)

    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as z:
        # ZIP root holds module.json (Foundry installer extracts into the module directory).
        z.writestr("module.json", data)
        scripts = module_dir / "scripts"
        for path in sorted(scripts.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(module_dir).as_posix())
    with ZipFile(archive) as z:
        packaged = json.loads(z.read("module.json"))
        assert packaged == manifest
        for file in manifest.get("esmodules", []):
            assert file in z.namelist(), f"Missing module entrypoint {file}"

    return output_manifest, archive


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Public HTTPS folder URL, e.g. https://planner.example/foundry")
    parser.add_argument("--output", default="dist/foundry", help="Directory to generate manifest and versioned ZIP")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    output_dir = Path(args.output)
    if not output_dir.is_absolute():
        output_dir = repo_root / output_dir
    manifest, archive = build_release(repo_root / "apps" / "foundry-module", output_dir, args.base_url)
    print(f"Manifest: {manifest}\nArchive:  {archive}\nInstall URL: {args.base_url.rstrip('/')}/module.json")


if __name__ == "__main__":
    main()
