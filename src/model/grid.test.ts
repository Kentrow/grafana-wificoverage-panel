/**
 * @jest-environment node
 */
import { AccessPoint } from '../types';
import { segmentsIntersect } from './geometry';
import { computeGrid, effectiveResolution, MAX_CELLS, signalsAt, smoothGrid } from './grid';
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
