import { DataFrame, Field, FieldType, Labels } from '@grafana/data';
import { AccessPoint, Band, BANDS, Radio } from '../types';

export type MetricRole = 'info' | 'up' | 'txPower' | 'channel' | 'clients' | 'noise';

// Matched against the end of the metric name, so any vendor prefix works (aruba_ap_info, unifi_ap_info...).
const ROLE_SUFFIXES: Array<[string, MetricRole]> = [
  ['ap_info', 'info'],
  ['ap_up', 'up'],
  ['tx_power_dbm', 'txPower'],
  ['radio_channel', 'channel'],
  ['ap_clients', 'clients'],
  ['noise_floor_dbm', 'noise'],
];

const RADIO_FIELDS: Partial<Record<MetricRole, keyof Radio>> = {
  txPower: 'txPowerDbm',
  channel: 'channel',
  clients: 'clients',
  noise: 'noiseFloorDbm',
};

export function roleOf(name: string | undefined): MetricRole | undefined {
  if (!name) {
    return undefined;
  }
  const lower = name.toLowerCase();
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
  const v = value.replace(/\s/g, '').toLowerCase();
  if (v.startsWith('2.4') || v === '2g' || v === '2ghz') {
    return '2.4GHz';
  }
  if (v.startsWith('5')) {
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
function frameSamples(frame: DataFrame): Sample[] {
  const samples: Sample[] = [];
  const valueFields = frame.fields.filter((f) => f.type === FieldType.number);
  // Table format: labels are string columns, one row per series (or per point for a range).
  const labelFields = frame.fields.filter((f) => f.type === FieldType.string);

  for (const field of valueFields) {
    if (labelFields.length > 0 && !field.labels?.ap) {
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
        const role = roleOf(labels.__name__) ?? roleOf(frame.refId) ?? roleOf(frame.name);
        if (role) {
          samples.push({ role, labels, value, field, row });
        }
      }
      continue;
    }
    const labels = field.labels ?? {};
    const role = roleOf(labels.__name__) ?? roleOf(frame.refId) ?? roleOf(frame.name) ?? roleOf(field.name);
    const row = lastNumberIndex(field);
    if (role && row >= 0) {
      samples.push({ role, labels, value: field.values[row], field, row });
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
 * Join every frame by the `ap` label into one list of access points, sorted by name. The info
 * series is the inventory when there is one; without it, any series with an `ap` label makes an
 * AP, to be placed by hand. The info series also brings the position and inventory labels.
 */
export function joinFrames(frames: DataFrame[]): JoinResult {
  const samples = frames.flatMap(frameSamples);
  const roles = new Set<MetricRole>(samples.map((s) => s.role));
  const inventory = roles.has('info') ? samples.filter((s) => s.role === 'info') : samples;
  const byName = new Map<string, AccessPoint>();

  for (const { labels } of inventory) {
    if (labels.ap && !byName.has(labels.ap)) {
      byName.set(labels.ap, { name: labels.ap, up: true, radios: {} });
    }
  }

  for (const sample of samples) {
    const ap = byName.get(sample.labels.ap);
    if (!ap) {
      continue;
    }
    if (sample.role === 'info') {
      const x = coordinate(sample.labels.x);
      const y = coordinate(sample.labels.y);
      Object.assign(ap, {
        ...(x !== undefined && y !== undefined ? { x, y } : {}),
        model: sample.labels.model,
        site: sample.labels.site,
        building: sample.labels.building,
        floor: sample.labels.floor,
        getLinks: sample.field.getLinks ? () => sample.field.getLinks!({ valueRowIndex: sample.row }) : undefined,
      });
      continue;
    }
    if (sample.role === 'up') {
      ap.up = sample.value > 0;
      continue;
    }
    const band = parseBand(sample.labels.band);
    const key = RADIO_FIELDS[sample.role];
    if (band && key) {
      ap.radios[band] = { ...ap.radios[band], [key]: sample.value };
    }
  }

  const aps = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { aps, roles };
}
