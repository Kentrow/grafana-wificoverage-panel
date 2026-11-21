# Changelog

## Unreleased

- Grafana 12.4 and later are supported, instead of 13.2 and later.
- Tables with one row per access point or per radio, such as from SQL: numeric columns are metrics recognised by their name, `x` and `y` the position.
- **Data** options for other label and metric names: AP label, band label, and the end of each metric name.
- Bands also read as `ng`, `na`, `6e`, `2.4G` or `2_4ghz`.
- Without an info series, the position and inventory labels come from the other series.
- README recipes for UniFi (UnPoller) and TP-Link Omada (omada_exporter).
- Zoom and pan of the plan: Ctrl+wheel or a pinch at the pointer, buttons, drag to move; the map is painted for the part shown, so it stays sharp.
- The legend gives the share of the floor in good coverage, and the share of each level on hover; it follows the what-if changes.
- While an access point is dragged, the map is computed at a coarser resolution when needed to take about 40 ms, so that it follows the pointer on large floors; the full resolution comes back on release.

## 0.1.2 (2026-11-21)

Fixes.

- An access point less than 1 m from a wall, such as one mounted on it, no longer loses up to 3 dB in its own room and gets the full loss of that wall on the far side.
- In a range query, the series that stopped before the end of the range are ignored, as an instant query would: an access point that stopped reporting its radios no longer keeps its last coverage.
- A warning in the legend when the thresholds do not go down from Good to Fair, Weak and Hide below.
- When Grafana serves the plugin from another origin, such as a CDN, the coverage is still computed in a web worker instead of falling back to the main thread.

## 0.1.1 (2026-11-04)

Signed release: same plugin code as 0.1.0, now signed by Grafana Labs.

## 0.1.0 (2026-10-29)

Initial release.

- Predicted coverage per band on a floor plan: log-distance model with wall losses, soft shadows, computed in a web worker.
- Signal (RSSI) and best AP views, thresholds and legend, hover with the best and second AP.
- APs from Prometheus series joined by the `ap` label, positions from `x` and `y` labels or placed by hand.
- Plan editor, from the panel editor or with "Edit plan" in dashboard edit mode: move APs, draw and edit walls and rooms, change the material of several walls at once with Ctrl+click, set the scale from a known length, upload a plan, undo and redo.
- What-if mode: move, add or switch off APs without saving.
- Data links from each AP.
- Migration handler for options saved by earlier builds.
