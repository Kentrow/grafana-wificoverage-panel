import { LinkModel } from '@grafana/data';

export type Band = '2.4GHz' | '5GHz' | '6GHz';

export const BANDS: Band[] = ['2.4GHz', '5GHz', '6GHz'];

/** A point in relative plan coordinates: 0..1, origin top left. */
export type RelPoint = [number, number];

export interface Radio {
  txPowerDbm?: number;
  channel?: number;
  clients?: number;
  noiseFloorDbm?: number;
}

export interface AccessPoint {
  name: string;
  /** Relative position on the plan, 0..1, origin top left. Unset until placed. */
  x?: number;
  y?: number;
  /** Where the position comes from: the data's x and y labels, or the panel's own positions. */
  positionSource?: 'data' | 'panel';
  up: boolean;
  model?: string;
  site?: string;
  building?: string;
  floor?: string;
  radios: Partial<Record<Band, Radio>>;
  /** Data links configured on the info series, resolved for this AP. */
  getLinks?: () => LinkModel[];
  /** An AP added in the what-if mode: not in the data, never saved. */
  virtual?: boolean;
}

/** Temporary changes of the what-if mode, never saved. */
export interface WhatIf {
  /** Positions of real APs moved for the scenario, by name. */
  moved: Record<string, RelPoint>;
  /** Real APs switched on or off for the scenario: their state from the data is flipped. */
  switched: string[];
  /** APs added for the scenario. */
  added: AccessPoint[];
}

export interface Wall {
  from: RelPoint;
  to: RelPoint;
  material: string;
}

export interface FloorGeometry {
  size_m: [number, number];
  walls?: Wall[];
  /** Optional plan URL, overrides the panel option for this floor. */
  plan?: string;
}

/** Either one floor, or several floors keyed by name (picked with the floor option). */
export type GeometryOption = FloorGeometry | { floors: Record<string, FloorGeometry> };

export interface BandModel {
  frequencyMhz: number;
  /** Path loss exponent n. */
  exponent: number;
  apGainDbi: number;
  clientGainDbi: number;
}

/** Attenuation in dB per wall crossing, per band. */
export type MaterialTable = Record<string, Record<Band, number>>;

export type CoverageView = 'rssi' | 'bestAp';

export type ColorMode = 'gradient' | 'steps';

export interface Thresholds {
  /** Voice and video. */
  good: number;
  /** Data. */
  fair: number;
  /** Connection possible. */
  weak: number;
  /** Below this the map is transparent. */
  floor: number;
}

export interface CoverageOptions {
  floorplanUrl: string;
  floor: string;
  band: string;
  geometry: GeometryOption;
  view: CoverageView;
  resolutionM: number;
  thresholds: Thresholds;
  colorMode: ColorMode;
  heatmapOpacity: number;
  showWalls: boolean;
  showApLabels: boolean;
  showRanges: boolean;
  showLegend: boolean;
  bandModels: Partial<Record<Band, Partial<BandModel>>>;
  materials: Partial<MaterialTable>;
  /** Positions set by hand in the panel editor, by AP name. They win over the data. */
  apPositions?: Record<string, RelPoint>;
  /** Plan images uploaded in the panel editor, as data URLs, by floor (see floorKey). */
  planImages?: Record<string, string>;
  /** Show the what-if button, which lets viewers try changes without saving them. */
  allowWhatIf?: boolean;
  /** Show the Edit plan button to users who can edit dashboards, outside the panel editor too. */
  allowPlanEditing?: boolean;
}
