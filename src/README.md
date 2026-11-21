# Wi-Fi coverage

[![CI](https://github.com/Kentrow/grafana-wificoverage-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/Kentrow/grafana-wificoverage-panel/actions/workflows/ci.yml)
[![Grafana](https://img.shields.io/badge/dynamic/json?logo=grafana&label=Grafana&color=F47A20&query=%24.dependencies.grafanaDependency&url=https%3A%2F%2Fraw.githubusercontent.com%2FKentrow%2Fgrafana-wificoverage-panel%2Fmain%2Fsrc%2Fplugin.json)](https://grafana.com/docs/grafana/latest/)
[![Catalog](https://img.shields.io/badge/dynamic/json?logo=grafana&label=catalog&color=F47A20&prefix=v&query=%24.version&url=https%3A%2F%2Fgrafana.com%2Fapi%2Fplugins%2Fkentrow-wificoverage-panel)](https://grafana.com/grafana/plugins/kentrow-wificoverage-panel/)
[![Downloads](https://img.shields.io/badge/dynamic/json?logo=grafana&label=downloads&color=F47A20&query=%24.downloads&url=https%3A%2F%2Fgrafana.com%2Fapi%2Fplugins%2Fkentrow-wificoverage-panel)](https://grafana.com/grafana/plugins/kentrow-wificoverage-panel/)
[![License](https://img.shields.io/github/license/Kentrow/grafana-wificoverage-panel)](https://github.com/Kentrow/grafana-wificoverage-panel/blob/main/LICENSE)

Predicted Wi-Fi coverage on a floor plan: for each point of the floor, the best signal (RSSI) received from the access points that are up, band by band (2.4, 5 or 6 GHz), with a loss for each wall crossed. When an access point goes down, its coverage hole shows at the next refresh.

This is an estimate for dashboards and demonstrations, not a site survey: the log-distance model ignores reflections, neighbouring floors and people.

## Installation

The plugin is published in the [Grafana plugin catalog](https://grafana.com/grafana/plugins/kentrow-wificoverage-panel/), signed by Grafana Labs. Install it from **Administration > Plugins and data > Plugins** in Grafana, or with the CLI, then restart Grafana:

```shell
grafana cli plugins install kentrow-wificoverage-panel
```

With the Grafana Docker image, set `GF_PLUGINS_PREINSTALL=kentrow-wificoverage-panel`.

## Data

The panel joins every series by the `ap` label and keeps the last value of each series, so instant and range queries both work, in time series or table format. In a range query, a series that stopped more than a step before the end of the range is ignored, as an instant query would. Each metric is recognised by the end of its name (`__name__`), or by the query's refId when an aggregation drops the name.

| Metric (name ends with) | Labels                                                        | Use                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ap_info`               | `ap`, optional `x`, `y`, `model`, `site`, `building`, `floor` | The list of APs, and their position on the plan, `x` and `y` from 0 to 1, origin top left. Without it, every series with an `ap` label makes an AP. |
| `ap_up`                 | `ap`                                                          | 0 takes the AP out of the computation. Optional, APs are up by default.                                                                             |
| `tx_power_dbm`          | `ap`, `band`                                                  | Transmit power of each radio. An AP without a radio on the band does not transmit on it.                                                            |
| `radio_channel`         | `ap`, `band`                                                  | Channel and co-channel views, shown on hover.                                                                                                       |
| `ap_clients`            | `ap`, `band`                                                  | Shown on hover.                                                                                                                                     |
| `noise_floor_dbm`       | `ap`, `band`                                                  | Shown on hover.                                                                                                                                     |

Bands are `2.4GHz`, `5GHz` and `6GHz`; `2.4G`, `2_4ghz`, `ng`, `na` and `6e` are read too.

Without an `ap_info` series, the position and inventory labels come from the other series. APs without `x` and `y` can be placed by hand, see below.

### Tables from SQL and other data sources

A table with one row per access point or per radio works too: string columns, and numeric `x`, `y`, `floor`, `site`, `building` and `model` columns, describe the AP; every other numeric column is a metric recognised by its name, such as `tx_power_dbm`, `channel`, `clients` or `up`.

```sql
SELECT ap, band, x, y, tx_power_dbm, channel FROM radios WHERE floor = 1
```

### Other label and metric names

When the data uses other names, set them in the **Data** options: **AP label** and **Band label** (for example `name` and `radio`), and the end of each metric name, tried before the built-in one (for example `device_info` or `radio_transmit_power`).

## Recipes

These exporters do not know where the access points are: place them by hand on the plan, see below. The positions are saved in the panel. Name each query with the refId given, and set the **Data** options.

### UniFi with UnPoller

[UnPoller](https://unpoller.com) exports the radios of each access point. Its `band` label (`2.4`, `5`, `6`) is read as it is. In **Data**, set **AP label** to `name`, **Info metric** to `device_info` and **Transmit power metric** to `radio_transmit_power`.

| refId     | Query                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| `info`    | `unpoller_device_info{type="uap", site_name="$site"}`                            |
| `txPower` | `unpoller_device_radio_transmit_power{site_name="$site"}`                        |
| `channel` | `unpoller_device_radio_channel{site_name="$site"}`                               |
| `clients` | `sum without (station_type) (unpoller_device_radio_stations{site_name="$site"})` |

UnPoller has no state metric for access points: they all count as up.

### TP-Link Omada with omada_exporter

[omada_exporter](https://github.com/charlie-haley/omada_exporter) lists the access points but not their radios, so the transmit power of each band is given in the query: replace `20` and `23` with the powers set in the controller. In **Data**, set **AP label** to `device`.

| refId     | Query                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `info`    | `omada_device_uptime_seconds{device_type="ap", site="$site"}`                                                                                                                                                                  |
| `txPower` | `label_replace(omada_device_uptime_seconds{device_type="ap", site="$site"} * 0 + 20, "band", "2.4GHz", "", "") or label_replace(omada_device_uptime_seconds{device_type="ap", site="$site"} * 0 + 23, "band", "5GHz", "", "")` |

The same query gives a transmit power to the access points of any exporter that lists them without their radios, such as `aruba_wireless_ap_up` of [aruba_exporter](https://github.com/slashdoom/aruba_exporter).

## Edit the plan

Users who can edit dashboards get an **Edit plan** button in the legend, in view as in edit mode; in the panel editor the toolbar is always there. It sits above the plan:

- **Move APs**: drag an access point; the map follows as you drag, at a coarser resolution on floors that take long to compute. Unplaced APs are listed to be put on the plan. Positions set this way are saved in the panel options and win over the data; **Back to data position** removes them.
- **Draw walls**: drag to draw a wall in the chosen material. Wall ends snap to other walls, nearly straight walls are straightened, Shift keeps them horizontal or vertical. Click a wall to select it, Ctrl+click (Cmd+click) to add or remove walls, Ctrl+A to select them all; then change their material or press Delete. A single selected wall can have its ends dragged.
- **Rooms**: drag a rectangle to add the four walls of a room at once, in the chosen material.
- **Scale**: draw a line over a length you know on the plan, such as a corridor, and type its real length: the floor size follows, keeping the plan's proportions.
- **Floor plan**: upload an SVG, PNG, JPEG or WebP plan for the shown floor and set its size in metres, keeping the image proportions. A panel has no file storage: the plan is stored in the dashboard, SVG as is, other images scaled down to 2000 px and converted to WebP. Prefer SVG, or a URL for heavy plans.
- **Undo** and **Redo** (Ctrl+Z, Ctrl+Shift+Z) go back over these changes; Discard drops them all.

Changes are saved with the dashboard: after **Done**, save the dashboard to keep them. Turn the button off with the **Allow plan editing** option. For a dashboard generated from an inventory, copy the geometry from the panel options back to the source.

## Zoom

Ctrl+wheel (Cmd+wheel on a Mac), or a pinch on a touchpad, zooms at the pointer, up to 8 times; the buttons at the top right of the plan zoom in, out, and back to the whole floor. Once zoomed, drag the plan to move it, or drag it with the middle button in the plan editor. The zoom belongs to the viewer and is not saved.

## What if

Outside the editor, **What if** in the legend lets anyone try changes and see the coverage and its share of the floor follow: drag APs, add APs (with the median transmit power of the real ones), click an AP to switch it off or change its transmit power, from -20 to +10 dB on every band. Nothing is saved; **Done** goes back to the data. Turn it off with the **Allow what-if** option.

## Options

- **Floor plan URL**: SVG or PNG stretched to the floor's size, for example `public/floorplans/${site}-f${floor}.svg` for files served by Grafana, or any absolute URL. Variables allowed. Other relative paths resolve like the Canvas panel's images, from `public/build/`.
- **Geometry**: floor size in metres and walls, as JSON. Wall ends go from 0 to 1 like the APs.

  ```json
  {
    "size_m": [62, 24],
    "walls": [{ "from": [0.22, 0], "to": [0.22, 1], "material": "glass" }]
  }
  ```

  For a dashboard with a floor variable, give every floor and set **Floor** to pick one, for example `${site}-f${floor}`:

  ```json
  { "floors": { "hq-f1": { "size_m": [62, 24], "walls": [] } } }
  ```

- **Band**: `2.4GHz`, `5GHz`, `6GHz`, or a variable such as `$band`.
- **View**:
  - **Signal (RSSI)**.
  - **Best AP**: one colour per dominant access point, the cells of two access points parted by a thin gap so that they stand apart whatever their colours.
  - **Channel**: the channel of the dominant access point, one colour per channel. Two neighbouring cells of the same colour are two access points on the same channel.
  - **Co-channel**: how many other access points are heard on the channel of the dominant one, from 0 to 3 or more, in the colours of the palette. Hovering names them.
- **Co-channel from**: the level from which an access point on the same channel counts, -82 dBm by default, where a Wi-Fi radio waits for the other to finish. On 2.4 GHz, channels less than 5 apart overlap; on 5 and 6 GHz only the same channel counts, the channel width not being in the data.
- **Palette**: red to green, or blue, which every colour vision reads: its lightness follows the signal, darker with more signal on a light theme and lighter on a dark one. On a light theme, lower the map opacity if the plan gets hard to read.
- **Thresholds**: good -67 dBm (voice, video), fair -75 dBm (data), weak -82 dBm (connection possible), hidden below -90 dBm. The legend gives the share of the floor in good coverage, and the other levels on hover.
- **Radio model**: wall materials and band parameters, merged over the defaults below.
- **AP positions**: positions set in the editor, by AP name.
- **Uploaded plans**: plans uploaded in the editor, by floor, with their size and a button to remove them.
- **Data links**: links set in the field options open from each access point, with `${__field.labels.ap}` for its name.
- **Data**: the label naming the access point and the band, and the metric names, when they differ from the defaults above.

## Model

`RSSI = Ptx + Gap + Gclient - PL(1 m) - 10 n log10(d) - sum of wall losses`, with `PL(1 m) = 20 log10(f MHz) - 27.55` and `d` at least 1 m.

|                     | 2.4 GHz | 5 GHz | 6 GHz |
| ------------------- | ------- | ----- | ----- |
| Frequency (MHz)     | 2437    | 5500  | 6500  |
| Exponent n          | 3.0     | 3.2   | 3.4   |
| AP gain (dBi)       | 4       | 5     | 5     |
| Glass, drywall (dB) | 3       | 4     | 5     |
| Brick (dB)          | 6       | 10    | 12    |
| Concrete (dB)       | 12      | 15    | 18    |
| Metal (dB)          | 25      | 30    | 30    |

These defaults are orders of magnitude, to be calibrated.
