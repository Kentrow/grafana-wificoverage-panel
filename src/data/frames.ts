import { DataFrame, Field, FieldType, Labels } from '@grafana/data';
import { AccessPoint, Band, BANDS, MetricRole, Radio } from '../types';

// Matched against the end of the metric name, so any vendor prefix works (aruba_ap_info, unifi_ap_info...).
export const METRIC_SUFFIXES: Record<MetricRole, string> = {
  info: 'ap_info',
  up: 'ap_up',
  txPower: 'tx_power_dbm',
  channel: 'radio_channel',
  clients: 'ap_clients',
  noise: 'noise_floor_dbm',
};

const ROLE_SUFFIXES = Object.entries(METRIC_SUFFIXES).map(([role, suffix]) => [suffix, role as MetricRole] as const);

const RADIO_FIELDS: Partial<Record<MetricRole, keyof Radio>> = {
  txPower: 'txPowerDbm',
  channel: 'channel',
  clients: 'clients',
  noise: 'noiseFloorDbm',
};

/** Where the panel finds its data, from the panel options. */
export interface DataMapping {
  /** Label or column naming the access point. */
  apLabel: string;
  /** Label or column naming the band of a radio. */
  bandLabel: string;
  /** Metric name endings by role, tried before the built-in ones. */
  metrics: Partial<Record<MetricRole, string>>;
}

export const DEFAULT_MAPPING: DataMapping = { apLabel: 'ap', bandLabel: 'band', metrics: {} };

/** Numeric columns of a table that describe the AP rather than measure it. */
const INVENTORY_COLUMNS = ['x', 'y', 'floor', 'site', 'building', 'model'];

export function roleOf(name: string | undefined, metrics: DataMapping['metrics'] = {}): MetricRole | undefined {
  if (!name) {
    return undefined;
  }
  const lower = name.toLowerCase();
  for (const [role, suffix] of Object.entries(metrics)) {
    const custom = suffix?.trim().toLowerCase();
    if (custom && lower.endsWith(custom)) {
      return role as MetricRole;
    }
  }
  for (const [suffix, role] of ROLE_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return role;
    }
  }
  // A query can also be named after the role itself: refId "txPower", "up"...
  return ROLE_SUFFIXES.find(([, role]) => role.toLowerCase() === lower)?.[1];
}

export function parseBand(value: string | undefined): Band | undefined {
  if (!value) {
    return undefined;
  }
  const v = value.replace(/\s/g, '').replace(/[_,]/g, '.').toLowerCase();
  // ng and na are the 2.4 and 5 GHz radios of UniFi and other controllers.
  if (v.startsWith('2.4') || ['2g', '2ghz', 'ng', '11ng'].includes(v)) {
    return '2.4GHz';
  }
  if (v.startsWith('5') || ['na', '11na'].includes(v)) {
    return '5GHz';
  }
  if (v.startsWith('6')) {
    return '6GHz';
  }
  return BANDS.find((b) => b.toLowerCase() === v);
}

interface Sample {
  role: MetricRole;
  labels: Labels;
  value: number;
  field: Field;
  row: number;
  /** Time of the value and step of its series, for the time series of a range query. */
  time?: number;
  stepMs?: number;
}

/** Index of the last numeric value, or -1. */
function lastNumberIndex(field: Field): number {
  for (let i = field.values.length - 1; i >= 0; i--) {
    const v = field.values[i];
    if (typeof v === 'number' && !Number.isNaN(v)) {
      return i;
    }
  }
  return -1;
}

/** Turn a frame into labelled samples, keeping the last value of each series. */
function frameSamples(frame: DataFrame, { apLabel, bandLabel, metrics }: DataMapping): Sample[] {
  const samples: Sample[] = [];
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  // Table format: labels are string columns, one row per series (or per point for a range). A wide
  // table, such as one from SQL, also has numeric columns that describe the AP, such as x and y.
  const describes = (f: Field) =>
    f.type === FieldType.string ||
    (f.type === FieldType.number && [...INVENTORY_COLUMNS, apLabel, bandLabel].includes(f.name.toLowerCase()));
  const labelFields = frame.fields.filter(describes);
  const valueFields = frame.fields.filter((f) => f.type === FieldType.number && !describes(f));

  for (const field of valueFields) {
    if (labelFields.length > 0 && !field.labels?.[apLabel]) {
      for (let row = 0; row < frame.length; row++) {
        const value = field.values[row];
        if (typeof value !== 'number' || Number.isNaN(value)) {
          continue;
        }
        const labels: Labels = { ...field.labels };
        for (const lf of labelFields) {
          if (lf.values[row] != null) {
            labels[lf.name] = String(lf.values[row]);
          }
        }
        // In a wide table each metric is a column named after it.
        const role =
          roleOf(labels.__name__, metrics) ??
          roleOf(field.name, metrics) ??
          roleOf(frame.refId, metrics) ??
          roleOf(frame.name, metrics);
        if (role) {
          samples.push({ role, labels, value, field, row });
        }
      }
      continue;
    }
    const labels = field.labels ?? {};
    const role =
      roleOf(labels.__name__, metrics) ??
      roleOf(frame.refId, metrics) ??
      roleOf(frame.name, metrics) ??
      roleOf(field.name, metrics);
    const row = lastNumberIndex(field);
    if (role && row >= 0) {
      const times = timeField?.values;
      const time = times?.[row];
      // Prometheus gives the step of a range query in the time field's config; else the series' last gap.
      const stepMs = timeField?.config.interval ?? (times && row > 0 ? time - times[row - 1] : undefined);
      samples.push({ role, labels, value: field.values[row], field, row, time, stepMs });
    }
  }
  return samples;
}

export interface JoinResult {
  aps: AccessPoint[];
  /** Roles seen in the data, to explain what is missing. */
  roles: Set<MetricRole>;
}

const coordinate = (label: string | undefined) => {
  const v = parseFloat(label ?? '');
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Drop the series of a range query that stopped more than a step before the latest value, such
 * as the radios of an AP that went away: an instant query at the end of the range would not have
 * them either, while their last value would keep the AP on the map.
 */
function withoutStale(samples: Sample[]): Sample[] {
  let latest = -Infinity;
  for (const s of samples) {
    if (typeof s.time === 'number' && s.time > latest) {
      latest = s.time;
    }
  }
  return samples.filter((s) => !(typeof s.time === 'number' && s.stepMs! > 0 && latest - s.time > s.stepMs!));
}

/**
 * Copy the position, inventory labels and data links of a sample to its AP. Those of the info
 * series win; the other series only fill what is missing, for data without an info series.
 */
function describeAp(ap: AccessPoint, { labels, field, row, role }: Sample): void {
  const wins = role === 'info';
  const x = coordinate(labels.x);
  const y = coordinate(labels.y);
  if (x !== undefined && y !== undefined && (wins || ap.x === undefined)) {
    ap.x = x;
    ap.y = y;
  }
  for (const key of ['model', 'site', 'building', 'floor'] as const) {
    if (labels[key] !== undefined && (wins || ap[key] === undefined)) {
      ap[key] = labels[key];
    }
  }
  if (field.getLinks && (wins || !ap.getLinks)) {
    ap.getLinks = () => field.getLinks!({ valueRowIndex: row });
  }
}

/**
 * Join every frame by the AP label into one list of access points, sorted by name. The info
 * series is the inventory when there is one; without it, any series with an AP label makes an
 * AP, to be placed by hand. The info series also brings the position and inventory labels.
 */
export function joinFrames(frames: DataFrame[], mapping: Partial<DataMapping> = {}): JoinResult {
  const map: DataMapping = { ...DEFAULT_MAPPING, ...mapping };
  const apLabel = map.apLabel.trim() || DEFAULT_MAPPING.apLabel;
  const bandLabel = map.bandLabel.trim() || DEFAULT_MAPPING.bandLabel;
  const resolved = { apLabel, bandLabel, metrics: map.metrics };
  const samples = withoutStale(frames.flatMap((frame) => frameSamples(frame, resolved)));
  const roles = new Set<MetricRole>(samples.map((s) => s.role));
  const inventory = roles.has('info') ? samples.filter((s) => s.role === 'info') : samples;
  const byName = new Map<string, AccessPoint>();

  for (const { labels } of inventory) {
    const name = labels[apLabel];
    if (name && !byName.has(name)) {
      byName.set(name, { name, up: true, radios: {} });
    }
  }

  for (const sample of samples) {
    const ap = byName.get(sample.labels[apLabel]);
    if (!ap) {
      continue;
    }
    describeAp(ap, sample);
    if (sample.role === 'info') {
      continue;
    }
    if (sample.role === 'up') {
      ap.up = sample.value > 0;
      continue;
    }
    const band = parseBand(sample.labels[bandLabel]);
    const key = RADIO_FIELDS[sample.role];
    if (band && key) {
      ap.radios[band] = { ...ap.radios[band], [key]: sample.value };
    }
  }

  const aps = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { aps, roles };
}
