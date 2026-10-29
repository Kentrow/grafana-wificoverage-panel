/**
 * @jest-environment node
 */
import { Band } from '../types';
import {
  DEFAULT_BAND_MODELS,
  DEFAULT_MATERIALS,
  pathLossAt1m,
  rangeForRssi,
  resolveMaterials,
  rssi,
} from './propagation';

// Expected values written out from the scoping document's table (PL at 1 m rounded to 0.1 dB),
// not from the code, so the test checks the formula and not itself.
const CASES: Array<{ band: Band; tx: number; pl1m: number; gain: number; n: number }> = [
  { band: '2.4GHz', tx: 10, pl1m: 40.2, gain: 4, n: 3.0 },
  { band: '5GHz', tx: 16, pl1m: 47.3, gain: 5, n: 3.2 },
  { band: '6GHz', tx: 16, pl1m: 48.7, gain: 5, n: 3.4 },
];

describe('log-distance model', () => {
  it.each(CASES)('matches the PL(1 m) table for $band', ({ band, pl1m }) => {
    expect(pathLossAt1m(DEFAULT_BAND_MODELS[band].frequencyMhz)).toBeCloseTo(pl1m, 1);
  });

  it.each(CASES.flatMap((c) => [1, 10, 20].map((d) => ({ ...c, d }))))(
    'gives the formula RSSI at $d m for $band within 0.1 dB',
    ({ band, tx, pl1m, gain, n, d }) => {
      const expected = tx + gain - pl1m - 10 * n * Math.log10(d);
      expect(Math.abs(rssi(tx, DEFAULT_BAND_MODELS[band], d) - expected)).toBeLessThanOrEqual(0.1);
    }
  );

  it('clamps distances below 1 m', () => {
    const model = DEFAULT_BAND_MODELS['5GHz'];
    expect(rssi(16, model, 0)).toBe(rssi(16, model, 1));
    expect(rssi(16, model, 0.3)).toBe(rssi(16, model, 1));
  });

  it.each([
    ['2.4GHz', 12],
    ['5GHz', 15],
    ['6GHz', 18],
  ] as Array<[Band, number]>)('removes %s concrete loss of %d dB', (band, loss) => {
    const model = DEFAULT_BAND_MODELS[band];
    const wallLoss = DEFAULT_MATERIALS.concrete[band];
    expect(rssi(16, model, 10) - rssi(16, model, 10, wallLoss)).toBeCloseTo(loss, 6);
  });

  it('inverts the model for the range at a threshold', () => {
    const model = DEFAULT_BAND_MODELS['5GHz'];
    const r = rangeForRssi(16, model, -67);
    expect(rssi(16, model, r)).toBeCloseTo(-67, 6);
  });

  it('merges material overrides over the defaults', () => {
    const table = resolveMaterials({ glass: { '5GHz': 6 } as never, lead: { '2.4GHz': 40, '5GHz': 40, '6GHz': 40 } });
    expect(table.glass).toEqual({ '2.4GHz': 3, '5GHz': 6, '6GHz': 5 });
    expect(table.lead['6GHz']).toBe(40);
    expect(table.concrete).toEqual(DEFAULT_MATERIALS.concrete);
  });
});
