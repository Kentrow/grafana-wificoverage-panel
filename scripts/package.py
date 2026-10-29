#!/usr/bin/env python3
"""Package the production build in dist/ as artifacts/<plugin id>-<version>.zip.

The archive holds one folder named after the plugin ID, as described in
https://grafana.com/developers/plugin-tools/publish-a-plugin/package-a-plugin, so it can be
unzipped straight into a Grafana plugins directory. Stdlib only: works where the zip command
is missing.

    npm run package
"""

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ARTIFACTS = ROOT / "artifacts"


def main():
    plugin_json = DIST / "plugin.json"
    if not plugin_json.exists():
        sys.exit("dist/ is empty: run npm run build first.")
    plugin = json.loads(plugin_json.read_text())
    plugin_id = plugin["id"]
    version = plugin["info"]["version"]
    # The development build evaluates its modules from strings and does not belong in a release.
    if "%VERSION%" in version or "eval(" in (DIST / "module.js").read_text():
        sys.exit("dist/ holds a development build: run npm run build first.")

    ARTIFACTS.mkdir(exist_ok=True)
    archive = ARTIFACTS / f"{plugin_id}-{version}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(DIST.rglob("*")):
            zf.write(path, (Path(plugin_id) / path.relative_to(DIST)).as_posix())
    print(f"{archive.relative_to(ROOT)}: {archive.stat().st_size / 1000:.0f} kB")


if __name__ == "__main__":
    main()
