# Changelog

## 0.1.0 (2026-10-29)

Initial release.

- Predicted coverage per band on a floor plan: log-distance model with wall losses, soft shadows, computed in a web worker.
- Signal (RSSI) and best AP views, thresholds and legend, hover with the best and second AP.
- APs from Prometheus series joined by the `ap` label, positions from `x` and `y` labels or placed by hand.
- Plan editor, from the panel editor or with "Edit plan" in dashboard edit mode: move APs, draw and edit walls and rooms, change the material of several walls at once with Ctrl+click, set the scale from a known length, upload a plan, undo and redo.
- What-if mode: move, add or switch off APs without saving.
- Data links from each AP.
- Migration handler for options saved by earlier builds.
