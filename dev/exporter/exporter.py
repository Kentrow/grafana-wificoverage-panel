#!/usr/bin/env python3
"""Simulated Aruba exporter for plugin development. Stdlib only.

Serves the metrics of the panel's data contract from dev/site.json, with Aruba-style names and
labels, and a control page to take APs down:

    GET /metrics                 Prometheus metrics
    GET /                        control page
    GET /ap/<name>/down|up       change an AP's state
    GET /reset                   every AP up
"""

import hashlib
import html
import json
import os
import random
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITE_FILE = os.environ.get("SITE_FILE", "/app/site.json")
PORT = int(os.environ.get("PORT", "9105"))

BANDS = ("2.4GHz", "5GHz", "6GHz")
CHANNELS = {"2.4GHz": (1, 6, 11), "5GHz": (36, 52, 100, 116, 132, 149), "6GHz": (5, 37, 69, 101, 133)}
# Simulated power ranges from the scoping document.
TX_RANGE = {"2.4GHz": (8, 12), "5GHz": (14, 18), "6GHz": (14, 18)}
NOISE = {"2.4GHz": -92, "5GHz": -95, "6GHz": -96}

lock = threading.Lock()
down = set()


def load_aps():
    data = json.load(open(SITE_FILE))
    aps = []
    for site, site_def in data["sites"].items():
        for floor_id, floor in site_def["floors"].items():
            for ap in floor["aps"]:
                aps.append({**ap, "site": site, "building": site_def["building"], "floor": floor_id})
    return aps


def seeded(name, salt):
    """Stable pseudo-random generator per AP, so power and channels do not jump between scrapes."""
    return random.Random(int(hashlib.sha256(f"{name}/{salt}".encode()).hexdigest()[:8], 16))


def bands_of(ap):
    return BANDS if ap["model"] != "AP-535" else BANDS[:2]


def labels(**kv):
    return "{" + ",".join(f'{k}="{v}"' for k, v in kv.items()) + "}"


def metrics(aps):
    lines = []

    def family(name, help_text, samples):
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} gauge")
        lines.extend(f"{name}{lbl} {value}" for lbl, value in samples)

    family(
        "aruba_ap_info",
        "Access point inventory, position x and y from 0 to 1 on the floor plan.",
        [
            (labels(ap=a["ap"], site=a["site"], building=a["building"], floor=a["floor"], model=a["model"],
                    x=a["x"], y=a["y"]), 1)
            for a in aps
        ],
    )
    family("aruba_ap_up", "1 when the access point is up.",
           [(labels(ap=a["ap"], floor=a["floor"]), 0 if a["ap"] in down else 1) for a in aps])

    radios = [(a, b) for a in aps if a["ap"] not in down for b in bands_of(a)]
    family("aruba_radio_tx_power_dbm", "Radio transmit power in dBm.",
           [(labels(ap=a["ap"], band=b), seeded(a["ap"], b).randint(*TX_RANGE[b])) for a, b in radios])
    family("aruba_radio_channel", "Radio channel.",
           [(labels(ap=a["ap"], band=b), seeded(a["ap"], "ch" + b).choice(CHANNELS[b])) for a, b in radios])
    family("aruba_ap_clients", "Associated clients per band.",
           [(labels(ap=a["ap"], band=b), max(0, seeded(a["ap"], "cl" + b).randint(0, 25) + random.randint(-2, 2)))
            for a, b in radios])
    family("aruba_radio_noise_floor_dbm", "Radio noise floor in dBm.",
           [(labels(ap=a["ap"], band=b), NOISE[b] + random.randint(-2, 2)) for a, b in radios])
    return "\n".join(lines) + "\n"


def control_page(aps):
    rows = []
    for a in aps:
        is_down = a["ap"] in down
        action = "up" if is_down else "down"
        rows.append(
            f"<tr><td>{html.escape(a['site'])} f{a['floor']}</td><td>{html.escape(a['ap'])}</td>"
            f"<td>{html.escape(a['model'])}</td><td class={'down' if is_down else 'up'}>{'down' if is_down else 'up'}</td>"
            f"<td><a href='/ap/{a['ap']}/{action}'>take {action}</a></td></tr>"
        )
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Simulated Aruba APs</title>
<style>body{{font-family:sans-serif;margin:2em}}td,th{{padding:.3em 1em;text-align:left}}
.up{{color:#2e7d32}}.down{{color:#c62828;font-weight:bold}}</style></head><body>
<h1>Simulated Aruba APs</h1><p>Prometheus scrapes every 5 s. <a href="/reset">All up</a> · <a href="/metrics">metrics</a></p>
<table><tr><th>Floor</th><th>AP</th><th>Model</th><th>State</th><th></th></tr>{''.join(rows)}</table></body></html>"""


class Handler(BaseHTTPRequestHandler):
    aps = load_aps()

    def send(self, code, body, content_type="text/html; charset=utf-8", location=None):
        data = body.encode()
        self.send_response(code)
        if location:
            self.send_header("Location", location)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        names = {a["ap"] for a in self.aps}
        parts = self.path.strip("/").split("/")
        with lock:
            if self.path == "/metrics":
                return self.send(200, metrics(self.aps), "text/plain; version=0.0.4")
            if self.path == "/reset":
                down.clear()
                return self.send(303, "", location="/")
            if len(parts) == 3 and parts[0] == "ap" and parts[1] in names and parts[2] in ("up", "down"):
                (down.discard if parts[2] == "up" else down.add)(parts[1])
                return self.send(303, "", location="/")
            if self.path == "/":
                return self.send(200, control_page(self.aps))
        self.send(404, "not found\n", "text/plain")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"exporter listening on :{PORT} with {len(Handler.aps)} APs", flush=True)
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
