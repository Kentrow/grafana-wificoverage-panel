/**
 * @jest-environment node
 */
import { AccessPoint } from '../types';
import {
  addWall,
  addWalls,
  roomWalls,
  scaleToLength,
  applyWhatIf,
  DEFAULT_TX_POWER_DBM,
  floorKey,
  moveWallEnd,
  typicalRadios,
  whatIfAp,
  placeAps,
  clickSelection,
  commonMaterial,
  removeWalls,
  setWallsMaterial,
  snapPoint,
  straighten,
  toRel,
  updateFloor,
  wallAt,
} from './layout';

const ap = (name: string, x?: number, y?: number): AccessPoint => ({ name, x, y, up: true, radios: {} });

describe('placeAps', () => {
  it('lets the panel positions win over the data', () => {
    const [moved, fromData, unplaced, placedByHand] = placeAps(
      [ap('a', 0.1, 0.1), ap('b', 0.2, 0.2), ap('c'), ap('d')],
      { a: [0.5, 0.5], d: [0.9, 0.9] }
    );
    expect(moved).toMatchObject({ x: 0.5, y: 0.5, positionSource: 'panel' });
    expect(fromData).toMatchObject({ x: 0.2, y: 0.2, positionSource: 'data' });
    expect(unplaced.x).toBeUndefined();
    expect(unplaced.positionSource).toBeUndefined();
    expect(placedByHand).toMatchObject({ x: 0.9, y: 0.9, positionSource: 'panel' });
  });
});

describe('toRel', () => {
  it('rounds and clamps to the plan', () => {
    expect(toRel([31, 12], [62, 24])).toEqual([0.5, 0.5]);
    expect(toRel([-3, 30], [62, 24])).toEqual([0, 1]);
    expect(toRel([10, 10], [30, 30])).toEqual([0.3333, 0.3333]);
  });
});

describe('updateFloor', () => {
  const wall = { from: [0, 0.5] as [number, number], to: [1, 0.5] as [number, number], material: 'glass' };

  it('edits a single-floor geometry', () => {
    const next = updateFloor({ size_m: [10, 10], walls: [] }, 'whatever', (f) => addWall(f, wall));
    expect(next).toEqual({ size_m: [10, 10], walls: [wall] });
  });

  it('edits only the shown floor of a multi-floor geometry', () => {
    const geometry = {
      floors: { f1: { size_m: [10, 10] as [number, number] }, f2: { size_m: [20, 20] as [number, number] } },
    };
    const next = updateFloor(geometry, 'f2', (f) => addWall(f, wall));
    expect(next).toEqual({ floors: { f1: { size_m: [10, 10] }, f2: { size_m: [20, 20], walls: [wall] } } });
    expect(updateFloor(geometry, 'f9', (f) => addWall(f, wall))).toBe(geometry);
  });

  it('starts from the default geometry when there is none', () => {
    expect(updateFloor(undefined, '', (f) => f)).toEqual({ size_m: [62, 24], walls: [] });
  });

  it('removes and retypes walls', () => {
    const floor = { size_m: [10, 10] as [number, number], walls: [wall, { ...wall, material: 'brick' }] };
    expect(removeWalls(floor, [0]).walls).toEqual([{ ...wall, material: 'brick' }]);
    expect(removeWalls(floor, [0, 1]).walls).toEqual([]);
    expect(setWallsMaterial(floor, [0], 'metal').walls?.map((w) => w.material)).toEqual(['metal', 'brick']);
    expect(setWallsMaterial(floor, [0, 1], 'glass').walls?.map((w) => w.material)).toEqual(['glass', 'glass']);
  });

  it('selects walls by click and Ctrl+click', () => {
    expect(clickSelection([1, 2], 3, false)).toEqual([3]);
    expect(clickSelection([1, 2], -1, false)).toEqual([]);
    expect(clickSelection([1, 2], 3, true)).toEqual([1, 2, 3]);
    expect(clickSelection([1, 2], 2, true)).toEqual([1]);
    expect(clickSelection([1, 2], -1, true)).toEqual([1, 2]);
  });

  it('finds the material shared by the selected walls', () => {
    const floor = { size_m: [10, 10] as [number, number], walls: [wall, { ...wall, material: 'brick' }, wall] };
    expect(commonMaterial(floor.walls, [0, 2])).toBe('glass');
    expect(commonMaterial(floor.walls, [0, 1])).toBeUndefined();
  });
});

describe('drawing helpers', () => {
  const walls: Array<[[number, number], [number, number]]> = [
    [
      [0, 0],
      [10, 0],
    ],
    [
      [10, 0],
      [10, 10],
    ],
  ];

  it('snaps to wall ends first, then onto walls', () => {
    expect(snapPoint([10.3, 0.2], walls, 0.5)).toEqual({ point: [10, 0], snapped: true });
    expect(snapPoint([5, 0.3], walls, 0.5)).toEqual({ point: [5, 0], snapped: true });
    expect(snapPoint([5, 5], walls, 0.5)).toEqual({ point: [5, 5], snapped: false });
  });

  it('finds the wall under the pointer', () => {
    expect(wallAt([9.8, 5], walls, 0.5)).toBe(1);
    expect(wallAt([5, 5], walls, 0.5)).toBe(-1);
  });

  it('straightens nearly horizontal or vertical walls', () => {
    expect(straighten([0, 0], [10, 0.3], 3)).toEqual([10, 0]);
    expect(straighten([0, 0], [0.2, 8], 3)).toEqual([0, 8]);
    expect(straighten([0, 0], [5, 4], 3)).toEqual([5, 4]);
    expect(straighten([0, 0], [5, 4], 3, true)).toEqual([5, 0]);
  });
});

describe('what-if', () => {
  const real = (name: string, tx5?: number): AccessPoint => ({
    name,
    x: 0.5,
    y: 0.5,
    up: true,
    radios: tx5 === undefined ? {} : { '5GHz': { txPowerDbm: tx5 } },
  });

  it('gives added APs the median power of the real ones', () => {
    const radios = typicalRadios([real('a', 14), real('b', 18), real('c', 16), real('d')]);
    expect(radios['5GHz']?.txPowerDbm).toBe(16);
    expect(radios['2.4GHz']?.txPowerDbm).toBe(DEFAULT_TX_POWER_DBM['2.4GHz']);
  });

  it('names added APs without clashes', () => {
    const first = whatIfAp([], [], [0.1, 0.2]);
    expect(first).toMatchObject({ name: 'What-if 1', x: 0.1, y: 0.2, virtual: true, up: true });
    expect(whatIfAp([], [first], [0, 0]).name).toBe('What-if 2');
  });

  it('switches on an AP the data reports down, with the typical power', () => {
    const down = { ...real('d'), up: false };
    const [, on] = applyWhatIf([real('a', 15), down], { moved: {}, switched: ['d'], added: [] });
    expect(on.up).toBe(true);
    expect(on.radios['5GHz']?.txPowerDbm).toBe(15);
  });

  it('moves, switches off and adds APs without touching the others', () => {
    const added = whatIfAp([], [], [0.9, 0.9]);
    const [a, b, c, d] = applyWhatIf([real('a'), real('b'), real('c')], {
      moved: { a: [0.1, 0.1] },
      switched: ['b'],
      added: [added],
    });
    expect(a).toMatchObject({ x: 0.1, y: 0.1, up: true, positionSource: 'panel' });
    expect(b).toMatchObject({ x: 0.5, up: false });
    expect(c).toEqual(real('c'));
    expect(d).toBe(added);
    expect(applyWhatIf([real('a')], undefined)).toEqual([real('a')]);
  });
});

describe('floorKey and moveWallEnd', () => {
  it('names the shown floor', () => {
    const multi = { floors: { f1: { size_m: [10, 10] as [number, number] } } };
    expect(floorKey(multi, 'f1')).toBe('f1');
    expect(floorKey(multi, '')).toBe('f1');
    expect(floorKey(multi, 'f2')).toBeUndefined();
    expect(floorKey({ size_m: [10, 10] }, 'anything')).toBe('');
    expect(floorKey(undefined, '')).toBe('');
  });

  it('moves one end of one wall', () => {
    const wall = { from: [0, 0] as [number, number], to: [1, 0] as [number, number], material: 'glass' };
    const floor = { size_m: [10, 10] as [number, number], walls: [wall, wall] };
    const next = moveWallEnd(floor, 1, 'to', [1, 1]);
    expect(next.walls).toEqual([wall, { ...wall, to: [1, 1] }]);
  });
});

describe('scale and rooms', () => {
  it('scales the floor from a measured line, keeping its proportions', () => {
    expect(scaleToLength([62, 24], 31, 15.5)).toEqual([31, 12]);
    expect(scaleToLength([100, 40], 10, 12.5)).toEqual([125, 50]);
  });

  it('makes the four walls of a room', () => {
    const walls = roomWalls([10, 5], [20, 15], [100, 50], 'brick');
    expect(walls).toEqual([
      { from: [0.1, 0.1], to: [0.2, 0.1], material: 'brick' },
      { from: [0.2, 0.1], to: [0.2, 0.3], material: 'brick' },
      { from: [0.2, 0.3], to: [0.1, 0.3], material: 'brick' },
      { from: [0.1, 0.3], to: [0.1, 0.1], material: 'brick' },
    ]);
    expect(addWalls({ size_m: [100, 50], walls: [walls[0]] }, walls.slice(1)).walls).toEqual(walls);
  });
});
