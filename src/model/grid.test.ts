/**
 * @jest-environment node
 */
import { AccessPoint, Band, FloorGeometry } from '../types';
import { segmentsIntersect } from './geometry';
import {
  computeGrid,
  CoverageGrid,
  coverageShares,
  dragResolution,
  effectiveResolution,
  MAX_CELLS,
  signalsAt,
  smoothGrid,
} from './grid';
import { DEFAULT_BAND_MODELS, DEFAULT_MATERIALS, NO_SIGNAL_DBM, rssi } from './propagation';
import { buildScene, resolveFloor, validateGeometry } from './scene';

describe('segmentsIntersect', () => {
  it('detects a crossing', () => {
    expect(segmentsIntersect(0, 0, 10, 0, 5, -1, 5, 1)).toBe(true);
  });
  it('ignores segments that stop short', () => {
    expect(segmentsIntersect(0, 0, 4, 0, 5, -1, 5, 1)).toBe(false);
  });
  it('ignores parallel segments', () => {
    expect(segmentsIntersect(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false);
  });
});

const ap = (name: string, x: number, y: number, extra: Partial<AccessPoint> = {}): AccessPoint => ({
  name,
  x,
  y,
  up: true,
  radios: { '2.4GHz': { txPowerDbm: 10 }, '5GHz': { txPowerDbm: 16 }, '6GHz': { txPowerDbm: 16 } },
  ...extra,
});

describe('coverage grid', () => {
  const floor = { size_m: [20, 10] as [number, number], walls: [] };

  it('keeps the best and second best AP per cell', () => {
    const { input } = buildScene(
      [ap('a', 0.1, 0.5), ap('b', 0.9, 0.5)],
      floor,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    );
    const grid = computeGrid(input, { smooth: false });
    expect(grid.cols).toBe(20);
    expect(grid.rows).toBe(10);
    const left = 5 * grid.cols + 1;
    expect(grid.bestAp[left]).toBe(0);
    expect(grid.secondAp[left]).toBe(1);
    expect(grid.best[left]).toBeGreaterThan(grid.second[left]);
    // Cell centre (1.5, 5.5) is 1.58 m from AP a at (2, 5).
    expect(grid.best[left]).toBeCloseTo(rssi(16, DEFAULT_BAND_MODELS['5GHz'], Math.hypot(0.5, 0.5)), 4);
  });

  it('subtracts the walls crossed', () => {
    const walled = {
      ...floor,
      walls: [{ from: [0.5, 0] as [number, number], to: [0.5, 1] as [number, number], material: 'concrete' }],
    };
    const open = buildScene(
      [ap('a', 0.1, 0.5)],
      floor,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    ).input;
    const closed = buildScene(
      [ap('a', 0.1, 0.5)],
      walled,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    ).input;
    const far = 5 * 20 + 15;
    const near = 5 * 20 + 3;
    expect(computeGrid(open).best[far] - computeGrid(closed).best[far]).toBeCloseTo(15, 4);
    expect(computeGrid(closed).best[near]).toBeCloseTo(computeGrid(open).best[near], 6);
    expect(signalsAt(closed, 15.5, 5.5)[0].walls).toBe(1);
  });

  it('counts a wall next to an AP fully on its far side and not at all on its own side', () => {
    // A concrete wall at x = 10 m, the AP 0.3 m from it: closer than the soft shadow radius.
    const walled = {
      ...floor,
      walls: [{ from: [0.5, 0] as [number, number], to: [0.5, 1] as [number, number], material: 'concrete' }],
    };
    const scene = (f: FloorGeometry) =>
      buildScene([ap('a', 9.7 / 20, 0.5)], f, '5GHz', DEFAULT_BAND_MODELS['5GHz'], DEFAULT_MATERIALS, 1).input;
    const loss = (xM: number) => signalsAt(scene(floor), xM, 5)[0].rssiDbm - signalsAt(scene(walled), xM, 5)[0].rssiDbm;
    expect(loss(4)).toBeCloseTo(0, 6);
    expect(loss(15)).toBeCloseTo(15, 6);
    const open = computeGrid(scene(floor), { smooth: false });
    const closed = computeGrid(scene(walled), { smooth: false });
    const cell = (col: number) => 5 * 20 + col;
    expect(open.best[cell(4)] - closed.best[cell(4)]).toBeCloseTo(0, 4);
    expect(open.best[cell(15)] - closed.best[cell(15)]).toBeCloseTo(15, 4);
  });

  it('leaves out APs that are down', () => {
    const { input } = buildScene(
      [ap('a', 0.5, 0.5, { up: false })],
      floor,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    );
    expect(input.aps).toHaveLength(0);
    expect(computeGrid(input).best.every((v) => v === NO_SIGNAL_DBM)).toBe(true);
  });

  it('leaves an AP-535 without a 6 GHz radio off the 6 GHz map', () => {
    const ap535 = ap('ap535', 0.5, 0.5, {
      model: 'AP-535',
      radios: { '2.4GHz': { txPowerDbm: 10 }, '5GHz': { txPowerDbm: 16 } },
    });
    const six = buildScene(
      [ap535, ap('ap635', 0.1, 0.1)],
      floor,
      '6GHz',
      DEFAULT_BAND_MODELS['6GHz'],
      DEFAULT_MATERIALS,
      1
    );
    expect(six.input.aps.map((a) => a.index)).toEqual([1]);
    expect(Array.from(computeGrid(six.input).bestAp).includes(0)).toBe(false);
  });

  it('reports unknown materials and counts them as 0 dB', () => {
    const odd = {
      ...floor,
      walls: [{ from: [0.5, 0] as [number, number], to: [0.5, 1] as [number, number], material: 'cardboard' }],
    };
    const scene = buildScene([ap('a', 0.1, 0.5)], odd, '5GHz', DEFAULT_BAND_MODELS['5GHz'], DEFAULT_MATERIALS, 1);
    expect(scene.unknownMaterials).toEqual(['cardboard']);
    expect(scene.input.walls[0].lossDb).toBe(0);
  });

  it('gives the same signal as the point by point computation', () => {
    // Walls in every direction, some through the APs' shadow ray origins, to cover the fallback.
    const walls = Array.from({ length: 12 }, (_, i) => ({
      from: [((i * 7) % 11) / 11, ((i * 5) % 7) / 7] as [number, number],
      to: [((i * 3 + 4) % 13) / 13, ((i * 11 + 2) % 9) / 9] as [number, number],
      material: ['glass', 'brick', 'concrete'][i % 3],
    }));
    walls.push({ from: [0.25, 0], to: [0.25, 1], material: 'metal' });
    const aps = [ap('a', 0.2, 0.3), ap('b', 0.7, 0.6), ap('c', 0.25, 0.8)];
    const { input } = buildScene(
      aps,
      { size_m: [20, 10], walls },
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      0.5
    );
    const grid = computeGrid(input, { smooth: false });
    let worst = 0;
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const [best] = signalsAt(input, (col + 0.5) * 0.5, (row + 0.5) * 0.5);
        worst = Math.max(worst, Math.abs(best.rssiDbm - grid.best[row * grid.cols + col]));
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('ignores walls of zero length, like the point by point computation', () => {
    const dot = {
      ...floor,
      walls: [{ from: [0.75, 0.2] as [number, number], to: [0.75, 0.2] as [number, number], material: 'concrete' }],
    };
    const open = buildScene(
      [ap('a', 0.25, 0.5)],
      floor,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    ).input;
    const walled = buildScene(
      [ap('a', 0.25, 0.5)],
      dot,
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      1
    ).input;
    expect(Array.from(computeGrid(walled, { smooth: false }).best)).toEqual(
      Array.from(computeGrid(open, { smooth: false }).best)
    );
    expect(signalsAt(walled, 15.5, 2.5)[0].rssiDbm).toBeCloseTo(
      computeGrid(walled, { smooth: false }).best[2 * 20 + 15],
      4
    );
  });

  it('coarsens the resolution of huge floors to bound the grid', () => {
    expect(effectiveResolution(62, 24, 0.5)).toBe(0.5);
    const res = effectiveResolution(62000, 24000, 0.5);
    expect(Math.ceil(62000 / res) * Math.ceil(24000 / res)).toBeLessThan(MAX_CELLS * 1.01);
    const { input } = buildScene(
      [ap('a', 0.5, 0.5)],
      { size_m: [6200, 2400], walls: [] },
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      0.5
    );
    const grid = computeGrid(input);
    expect(grid.cols * grid.rows).toBeLessThan(MAX_CELLS * 1.01);
    expect(grid.resolutionM).toBeGreaterThan(0.5);
  });

  it('computes a 62 x 24 m floor at 0.5 m with 10 APs and 30 walls in under 200 ms', () => {
    const aps = Array.from({ length: 10 }, (_, i) => ap(`ap${i}`, 0.05 + (i % 5) * 0.22, i < 5 ? 0.25 : 0.75));
    const walls = Array.from({ length: 30 }, (_, i) => ({
      from: [(i + 1) / 31, i % 2 ? 0 : 0.4] as [number, number],
      to: [(i + 1) / 31, i % 2 ? 0.6 : 1] as [number, number],
      material: i % 3 ? 'drywall' : 'glass',
    }));
    const { input } = buildScene(
      aps,
      { size_m: [62, 24], walls },
      '5GHz',
      DEFAULT_BAND_MODELS['5GHz'],
      DEFAULT_MATERIALS,
      0.5
    );
    computeGrid(input); // warm up the JIT
    const start = performance.now();
    const grid = computeGrid(input);
    const elapsed = performance.now() - start;
    expect(grid.cols * grid.rows).toBe(124 * 48);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('co-channel count', () => {
  const ap = (index: number, xM: number, channel?: number) => ({ index, xM, yM: 5, txPowerDbm: 16, channel });
  const input = (aps: Array<ReturnType<typeof ap>>, thresholdDbm = -82, span = 0, band: Band = '5GHz') => ({
    widthM: 20,
    heightM: 10,
    resolutionM: 1,
    model: DEFAULT_BAND_MODELS[band],
    aps,
    walls: [],
    cochannel: { thresholdDbm, span },
  });
  const cell = (col: number) => 5 * 20 + col;

  it('counts the other APs heard on the channel of the best one', () => {
    // A and B on 36, 8 m apart: each hears the other at about -55 dBm. C on 40 does not count.
    const grid = computeGrid(input([ap(0, 2.5, 36), ap(1, 10.5, 36), ap(2, 18.5, 40)]));
    expect(grid.cochannel?.[cell(2)]).toBe(1);
    expect(grid.cochannel?.[cell(10)]).toBe(1);
    expect(grid.cochannel?.[cell(18)]).toBe(0);
  });

  it('only counts the APs heard above the threshold', () => {
    const grid = computeGrid(input([ap(0, 2.5, 36), ap(1, 10.5, 36)], -50));
    expect(grid.cochannel?.[cell(2)]).toBe(0);
  });

  it('counts overlapping channels within the span, as on 2.4 GHz', () => {
    const overlapping = computeGrid(input([ap(0, 2.5, 1), ap(1, 10.5, 3)], -82, 4, '2.4GHz'));
    expect(overlapping.cochannel?.[cell(2)]).toBe(1);
    const apart = computeGrid(input([ap(0, 2.5, 1), ap(1, 10.5, 6)], -82, 4, '2.4GHz'));
    expect(apart.cochannel?.[cell(2)]).toBe(0);
  });

  it('leaves the APs without a channel out, and computes nothing unless asked', () => {
    const grid = computeGrid(input([ap(0, 2.5, 36), ap(1, 10.5)]));
    expect(grid.cochannel?.[cell(2)]).toBe(0);
    expect(computeGrid({ ...input([ap(0, 2.5, 36)]), cochannel: undefined }).cochannel).toBeUndefined();
  });
});

describe('coverageShares', () => {
  const thresholds = { good: -67, fair: -75, weak: -82, floor: -90 };
  /** A grid of 1 m cells with the given raw best signal, smoothed differently to check it is not used. */
  const grid = (cols: number, rows: number, values: number[]): CoverageGrid => ({
    cols,
    rows,
    resolutionM: 1,
    best: new Float32Array(values.length).fill(-30),
    bestRaw: new Float32Array(values),
    second: new Float32Array(values.length),
    bestAp: new Int16Array(values.length),
    secondAp: new Int16Array(values.length),
  });

  it('splits the floor between the quality levels, from the signal before smoothing', () => {
    const shares = coverageShares(grid(4, 1, [-60, -70, -80, -95]), [4, 1], thresholds);
    expect(shares).toEqual({ good: 0.25, fair: 0.25, weak: 0.25, insufficient: 0.25 });
  });

  it('counts only the cells whose centre is on the floor', () => {
    // A floor 2.4 m wide on 3 cells of 1 m: the third cell is centred at 2.5 m, off the floor.
    const shares = coverageShares(grid(3, 1, [-60, -60, -95]), [2.4, 1], thresholds);
    expect(shares.good).toBe(1);
    expect(shares.insufficient).toBe(0);
  });
});

describe('dragResolution', () => {
  // Times per cell measured in Node: 10 ms for an office of 5952 cells with 12 APs, 305 ms for a
  // warehouse of 134400 cells with 40 APs.
  it('keeps the resolution of a floor that is fast enough', () => {
    expect(dragResolution(62, 24, 0.5, 10 / 5952)).toBe(0.5);
  });
  it('coarsens a slow floor to about 40 ms a map, in steps of 0.25 m', () => {
    // 8400 m² at 0.75 m is 14933 cells, about 34 ms.
    expect(dragResolution(140, 60, 0.25, 305 / 134400)).toBe(0.75);
  });
  it('stays within the requested resolution and 2 m', () => {
    expect(dragResolution(500, 200, 0.25, 0.05)).toBe(2);
    expect(dragResolution(500, 200, 1, undefined)).toBe(1);
    expect(dragResolution(5000, 5000, 2, 1)).toBe(2);
  });
});

describe('smoothGrid', () => {
  it('keeps a uniform field and softens a step', () => {
    const flat = new Float32Array(16).fill(-60);
    smoothGrid(flat, 4, 4);
    expect(Array.from(flat).every((v) => Math.abs(v + 60) < 1e-4)).toBe(true);

    const step = new Float32Array([-50, -50, -80, -80]);
    smoothGrid(step, 4, 1);
    expect(step[1]).toBeLessThan(-50);
    expect(step[2]).toBeGreaterThan(-80);
  });

  it('clamps no signal so it does not eat into covered cells', () => {
    const edge = new Float32Array([-85, -85, NO_SIGNAL_DBM, NO_SIGNAL_DBM]);
    smoothGrid(edge, 4, 1);
    expect(edge[0]).toBeGreaterThan(-95);
  });
});

describe('geometry option', () => {
  const single = { size_m: [62, 24], walls: [{ from: [0.22, 0], to: [0.22, 1], material: 'glass' }] };

  it('accepts the documented single-floor format', () => {
    expect(validateGeometry(single)).toEqual([]);
    expect(resolveFloor(single as never, 'anything')).toBe(single);
  });

  it('picks a floor by name in the multi-floor format', () => {
    const multi = { floors: { 'hq-f1': single, 'hq-f2': { size_m: [40, 20] } } };
    expect(validateGeometry(multi)).toEqual([]);
    expect(resolveFloor(multi as never, 'hq-f2')).toEqual({ size_m: [40, 20] });
    expect(resolveFloor(multi as never, 'lyon-f1')).toMatch(/No geometry for floor "lyon-f1"/);
  });

  it('refuses floor sizes that can only be typos', () => {
    expect(validateGeometry({ size_m: [62000, 24] })).toEqual([
      'geometry.size_m must be [width, height] in metres, from 1 to 5000.',
    ]);
    expect(validateGeometry({ size_m: [0.1, 0] })).toHaveLength(1);
  });

  it('explains what is wrong', () => {
    expect(validateGeometry({ size_m: [62], walls: [{ from: [0, 0] }] })).toEqual([
      'geometry.size_m must be [width, height] in metres, from 1 to 5000.',
      'geometry.walls[0] needs "from" and "to" as [x, y] between 0 and 1.',
      'geometry.walls[0] needs a "material".',
    ]);
  });
});
