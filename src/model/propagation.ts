import { Band, BandModel, MaterialTable } from '../types';

export const MIN_DISTANCE_M = 1;

/** Value used for "no signal" in grids: far below any useful threshold, but finite so it interpolates. */
export const NO_SIGNAL_DBM = -200;

export const DEFAULT_BAND_MODELS: Record<Band, BandModel> = {
  '2.4GHz': { frequencyMhz: 2437, exponent: 3.0, apGainDbi: 4, clientGainDbi: 0 },
  '5GHz': { frequencyMhz: 5500, exponent: 3.2, apGainDbi: 5, clientGainDbi: 0 },
  '6GHz': { frequencyMhz: 6500, exponent: 3.4, apGainDbi: 5, clientGainDbi: 0 },
};

// Orders of magnitude from the literature, to be calibrated.
export const DEFAULT_MATERIALS: MaterialTable = {
  glass: { '2.4GHz': 3, '5GHz': 4, '6GHz': 5 },
  drywall: { '2.4GHz': 3, '5GHz': 4, '6GHz': 5 },
  brick: { '2.4GHz': 6, '5GHz': 10, '6GHz': 12 },
  concrete: { '2.4GHz': 12, '5GHz': 15, '6GHz': 18 },
  metal: { '2.4GHz': 25, '5GHz': 30, '6GHz': 30 },
};

/** Free space path loss at 1 m, in dB. */
export function pathLossAt1m(frequencyMhz: number): number {
  return 20 * Math.log10(frequencyMhz) - 27.55;
}

/** Signal at 1 m before distance and wall losses: Ptx + Gap + Gclient - PL(1 m). */
export function referenceRssi(txPowerDbm: number, model: BandModel): number {
  return txPowerDbm + model.apGainDbi + model.clientGainDbi - pathLossAt1m(model.frequencyMhz);
}

/** Log-distance RSSI in dBm at `distanceM` metres, after `wallLossDb` of walls. */
export function rssi(txPowerDbm: number, model: BandModel, distanceM: number, wallLossDb = 0): number {
  const d = Math.max(distanceM, MIN_DISTANCE_M);
  return referenceRssi(txPowerDbm, model) - 10 * model.exponent * Math.log10(d) - wallLossDb;
}

/** Distance in metres at which the RSSI falls to `targetDbm` without walls (at least 1 m). */
export function rangeForRssi(txPowerDbm: number, model: BandModel, targetDbm: number): number {
  const margin = referenceRssi(txPowerDbm, model) - targetDbm;
  return Math.max(MIN_DISTANCE_M, Math.pow(10, margin / (10 * model.exponent)));
}

export function resolveBandModel(band: Band, overrides?: Partial<Record<Band, Partial<BandModel>>>): BandModel {
  return { ...DEFAULT_BAND_MODELS[band], ...overrides?.[band] };
}

export function resolveMaterials(overrides?: Partial<MaterialTable>): MaterialTable {
  const table: MaterialTable = { ...DEFAULT_MATERIALS };
  for (const [name, losses] of Object.entries(overrides ?? {})) {
    if (losses) {
      table[name] = { ...DEFAULT_MATERIALS[name], ...losses };
    }
  }
  return table;
}
