#!/usr/bin/env python3
"""Generate the dev floor plans, the exporter's site file and the dashboards from dev/sites.py.

This is what a real deployment would do at build time: draw the plans and write the walls into
the panel's geometry option, from one description of the floors. Stdlib only.

    python3 dev/generate.py
"""

import json
from pathlib import Path

from sites import EXTRA_MATERIALS, SITES

ROOT = Path(__file__).resolve().parent
SITE_FILE = ROOT / "site.json"
PLANS_DIR = ROOT / "floorplans"
DASHBOARD_FILE = ROOT.parent / "provisioning" / "dashboards" / "wifi-coverage.json"
E2E_DASHBOARD_FILE = ROOT.parent / "provisioning" / "dashboards" / "dashboard.json"

# Plan styling only; the radio losses live in the panel.
WALL_STROKE = {"glass": 0.12, "drywall": 0.15, "brick": 0.25, "concrete": 0.45, "metal": 0.45, "racking": 1.1}
WALL_COLOR = {"glass": "#7aa6d6", "racking": "#c9b28a"}
# When two rooms share a wall, the most attenuating material wins.
MATERIAL_RANK = ["glass", "drywall", "brick", "racking", "concrete", "metal"]
AREA_FILL = {"glass": "#eef4fb", "drywall": "#f6f6f4", "brick": "#f4ece6", "concrete": "#e4e4e4", "metal": "#dcdfe4"}


def r4(v):
    return round(v, 4)


def side_pieces(start, end, doors):
    """Split an axis-aligned side into the pieces left between its doors (offset, width)."""
    horizontal = start[1] == end[1]
    lo, hi = (start[0], end[0]) if horizontal else (start[1], end[1])
    pieces, cursor = [], lo
    for offset, width in sorted(doors):
        if lo + offset > cursor:
            pieces.append((cursor, lo + offset))
        cursor = max(cursor, lo + offset + width)
    if cursor < hi:
        pieces.append((cursor, hi))
    fixed = start[1] if horizontal else start[0]
    return [((a, fixed), (b, fixed)) if horizontal else ((fixed, a), (fixed, b)) for a, b in pieces]


def area_walls(area, width, height):
    """Edges of an area rectangle in metres, without open sides, doors and the building outline."""
    x, y, w, h = area["rect"]
    sides = {
        "n": ((x, y), (x + w, y)),
        "s": ((x, y + h), (x + w, y + h)),
        "w": ((x, y), (x, y + h)),
        "e": ((x + w, y), (x + w, y + h)),
    }
    for side, (a, b) in sides.items():
        if side in area["open"]:
            continue
        on_outline = (a[0] == b[0] and a[0] in (0, width)) or (a[1] == b[1] and a[1] in (0, height))
        if on_outline:
            continue
        doors = [(offset, door_width) for door_side, offset, door_width in area["doors"] if door_side == side]
        for p, q in side_pieces(a, b, doors):
            yield p, q, area["material"]


def floor_walls(floor):
    """Walls in metres: area edges, deduplicated where two rooms share one, then standalone segments."""
    width, height = floor["size_m"]
    shared = {}
    for area in floor["areas"]:
        for a, b, material in area_walls(area, width, height):
            key = tuple(sorted([a, b]))
            if key not in shared or MATERIAL_RANK.index(material) > MATERIAL_RANK.index(shared[key]):
                shared[key] = material
    walls = [(a, b, material) for (a, b), material in shared.items()]
    walls += [(tuple(seg["from"]), tuple(seg["to"]), seg["material"]) for seg in floor["segments"]]
    return walls


def relative_walls(walls, width, height):
    return [
        {"from": [r4(a[0] / width), r4(a[1] / height)], "to": [r4(b[0] / width), r4(b[1] / height)], "material": m}
        for a, b, m in walls
    ]


def plan_svg(floor, walls):
    width, height = floor["size_m"]
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width * 20}" height="{height * 20}" preserveAspectRatio="none">',
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#fbfbfa"/>',
    ]
    for area in floor["areas"]:
        x, y, w, h = area["rect"]
        fill = AREA_FILL.get(area["material"], "#f6f6f4")
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>')
        if area["label"]:
            size = round(min(1.4, w / max(4, len(area["name"])) * 1.6, h / 4), 2)
            out.append(
                f'<text x="{x + w / 2}" y="{y + h / 2}" font-family="sans-serif" font-size="{size}" '
                f'fill="#8a8f98" text-anchor="middle" dominant-baseline="middle">{area["name"]}</text>'
            )
    for a, b, material in walls:
        out.append(
            f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{WALL_COLOR.get(material, "#5b616b")}" '
            f'stroke-width="{WALL_STROKE.get(material, 0.15)}" stroke-linecap="butt"/>'
        )
    out.append(
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="none" stroke="#3d424a" stroke-width="0.6"/>'
    )
    out.append("</svg>")
    return "\n".join(out) + "\n"


def site_file():
    """The exporter's view of the sites: APs with relative positions."""
    sites = {}
    for site, site_def in SITES.items():
        floors = {}
        for floor_id, floor in site_def["floors"].items():
            width, height = floor["size_m"]
            floors[floor_id] = {
                "size_m": floor["size_m"],
                "aps": [
                    {"ap": ap["ap"], "model": ap["model"], "x": r4(ap["x_m"] / width), "y": r4(ap["y_m"] / height)}
                    for ap in floor["aps"]
                ],
            }
        sites[site] = {"building": site_def["building"], "floors": floors}
    return {"_comment": "Generated by dev/generate.py from dev/sites.py, read by the exporter.", "sites": sites}


def coverage_panel(panel_id, title, grid_pos, geometry, **options):
    base = {
        "floorplanUrl": "public/floorplans/${site}-f${floor}.svg",
        "floor": "${site}-f${floor}",
        "band": "$band",
        "geometry": geometry,
        "view": "rssi",
        "colorMode": "gradient",
        "thresholds": {"good": -67, "fair": -75, "weak": -82, "floor": -90},
        "heatmapOpacity": 0.6,
        "resolutionM": 0.5,
        "showWalls": True,
        "showApLabels": True,
        "showRanges": False,
        "showLegend": True,
        "materials": EXTRA_MATERIALS,
        "bandModels": {},
    }
    base.update(options)
    prom = {"type": "prometheus", "uid": "prometheus"}
    on_floor = 'aruba_ap_info{site="$site", floor="$floor"}'
    return {
        "id": panel_id,
        "type": "kentrow-wificoverage-panel",
        "title": title,
        "gridPos": grid_pos,
        "datasource": prom,
        "targets": [
            {"refId": "info", "datasource": prom, "expr": on_floor, "instant": True, "range": False},
            {"refId": "up", "datasource": prom, "expr": 'aruba_ap_up{floor="$floor"} and on(ap) ' + on_floor,
             "instant": True, "range": False},
            {"refId": "txPower", "datasource": prom, "expr": "aruba_radio_tx_power_dbm and on(ap) " + on_floor,
             "instant": True, "range": False},
            {"refId": "channel", "datasource": prom, "expr": "aruba_radio_channel and on(ap) " + on_floor,
             "instant": True, "range": False},
            {"refId": "clients", "datasource": prom, "expr": "aruba_ap_clients and on(ap) " + on_floor,
             "instant": True, "range": False},
            {"refId": "noise", "datasource": prom, "expr": "aruba_radio_noise_floor_dbm and on(ap) " + on_floor,
             "instant": True, "range": False},
        ],
        "fieldConfig": {
            "defaults": {
                "links": [
                    {"title": "AP details: ${__field.labels.ap}",
                     "url": "/d/wifi-ap-detail/wi-fi-ap-detail?var-ap=${__field.labels.ap}"}
                ]
            },
            "overrides": [],
        },
        "options": base,
    }


def dashboard(geometry):
    prom = {"type": "prometheus", "uid": "prometheus"}
    return {
        "uid": "wifi-coverage-dev",
        "title": "Wi-Fi coverage (dev)",
        "tags": ["wireless", "dev"],
        "editable": True,
        "refresh": "10s",
        "time": {"from": "now-15m", "to": "now"},
        "schemaVersion": 41,
        "templating": {
            "list": [
                {"name": "site", "type": "query", "datasource": prom, "query": "label_values(aruba_ap_info, site)",
                 "refresh": 1, "current": {"text": "hq", "value": "hq"}},
                {"name": "floor", "type": "query", "datasource": prom,
                 "query": 'label_values(aruba_ap_info{site="$site"}, floor)', "refresh": 1,
                 "current": {"text": "1", "value": "1"}},
                {"name": "band", "type": "custom", "query": "2.4GHz,5GHz,6GHz",
                 "current": {"text": "5GHz", "value": "5GHz"},
                 "options": [{"text": b, "value": b, "selected": b == "5GHz"} for b in ("2.4GHz", "5GHz", "6GHz")]},
            ]
        },
        "panels": [
            coverage_panel(1, "Predicted coverage · $band", {"x": 0, "y": 0, "w": 24, "h": 17}, geometry),
            coverage_panel(2, "Best AP · $band", {"x": 0, "y": 17, "w": 12, "h": 10}, geometry,
                           view="bestAp", showApLabels=False),
            coverage_panel(3, "2.4 GHz, -67 dBm ranges without walls", {"x": 12, "y": 17, "w": 12, "h": 10},
                           geometry, band="2.4GHz", showRanges=True, colorMode="steps", showApLabels=False),
        ],
    }


def raw_series(ref_id, name, labels, value):
    """One Prometheus-like series as a TestData raw frame."""
    return {
        "schema": {
            "refId": ref_id,
            "fields": [
                {"name": "Time", "type": "time"},
                {"name": "Value", "type": "number", "labels": {"__name__": name, **labels}},
            ],
        },
        "data": {"values": [[1700000000000], [value]]},
    }


def e2e_dashboard():
    """Self-contained dashboard for the e2e tests: TestData frames shaped like the Prometheus ones."""
    testdata = {"type": "grafana-testdata-datasource", "uid": "trlxrdZVk"}
    aps = [("ap-1", "AP-635", 0.2, 0.5, 1), ("ap-2", "AP-535", 0.5, 0.5, 1), ("ap-3", "AP-635", 0.8, 0.5, 0)]
    frames = []
    for name, model, x, y, up in aps:
        frames.append(raw_series("A", "aruba_ap_info", {"ap": name, "model": model, "x": str(x), "y": str(y)}, 1))
        frames.append(raw_series("A", "aruba_ap_up", {"ap": name}, up))
        bands = ("2.4GHz", "5GHz") if model == "AP-535" else ("2.4GHz", "5GHz", "6GHz")
        for band in bands:
            frames.append(raw_series("A", "aruba_radio_tx_power_dbm", {"ap": name, "band": band}, 16))
    geometry = {"size_m": [30, 10], "walls": [{"from": [0.35, 0], "to": [0.35, 1], "material": "concrete"}]}

    def panel(panel_id, title, targets, **options):
        return {
            "id": panel_id,
            "type": "kentrow-wificoverage-panel",
            "title": title,
            # Small enough to fit the test viewport: Grafana does not render panels out of view.
            "gridPos": {"x": 12 * ((panel_id - 1) % 2), "y": 6 * ((panel_id - 1) // 2), "w": 12, "h": 6},
            "datasource": testdata,
            "targets": targets,
            "options": {"geometry": geometry, "band": "5GHz", "showLegend": True, "showWalls": True,
                        "showApLabels": True, **options},
        }

    raw = [{"refId": "A", "datasource": testdata, "scenarioId": "raw_frame", "rawFrameContent": json.dumps(frames)}]
    return {
        "uid": "wifi-coverage-e2e",
        "title": "Wi-Fi coverage (e2e)",
        "schemaVersion": 41,
        "time": {"from": "now-6h", "to": "now"},
        "panels": [
            panel(1, "No data", [{"refId": "A", "datasource": testdata, "scenarioId": "no_data_points"}]),
            panel(2, "5 GHz", raw),
            panel(3, "6 GHz", raw, band="6GHz", showRanges=True),
        ],
    }


def main():
    PLANS_DIR.mkdir(exist_ok=True)
    floors = {}
    for site, site_def in SITES.items():
        for floor_id, floor in site_def["floors"].items():
            name = f"{site}-f{floor_id}"
            width, height = floor["size_m"]
            walls = floor_walls(floor)
            (PLANS_DIR / f"{name}.svg").write_text(plan_svg(floor, walls))
            floors[name] = {"size_m": floor["size_m"], "walls": relative_walls(walls, width, height)}
            print(f"{name}: {width} x {height} m, {len(walls)} walls, {len(floor['aps'])} APs")
    SITE_FILE.write_text(json.dumps(site_file(), indent=2) + "\n")
    DASHBOARD_FILE.write_text(json.dumps(dashboard({"floors": floors}), indent=2) + "\n")
    E2E_DASHBOARD_FILE.write_text(json.dumps(e2e_dashboard(), indent=2) + "\n")
    print("wrote dev/site.json, the dev dashboard and the e2e dashboard")


if __name__ == "__main__":
    main()
