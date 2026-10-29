import { AccessPoint, Band, BANDS, FloorGeometry, GeometryOption, Radio, RelPoint, Wall, WhatIf } from '../types';
import { DEFAULT_GEOMETRY } from './scene';

/** A point in metres. */
export type MPoint = [number, number];

const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function toRel([x, y]: MPoint, [widthM, heightM]: [number, number]): RelPoint {
  return [round4(Math.min(1, Math.max(0, x / widthM))), round4(Math.min(1, Math.max(0, y / heightM)))];
}

export function toMetres([x, y]: RelPoint, [widthM, heightM]: [number, number]): MPoint {
  return [x * widthM, y * heightM];
}

/**
 * Final AP positions: the panel's own positions win over the `x` and `y` labels of the data,
 * so APs can be placed or moved by hand. APs with neither stay unplaced.
 */
export function placeAps(aps: AccessPoint[], positions: Record<string, RelPoint> | undefined): AccessPoint[] {
  return aps.map((ap) => {
    const own = positions?.[ap.name];
    if (own) {
      return { ...ap, x: own[0], y: own[1], positionSource: 'panel' };
    }
    return ap.x !== undefined && ap.y !== undefined ? { ...ap, positionSource: 'data' } : ap;
  });
}

export function isPlaced(ap: AccessPoint): ap is AccessPoint & { x: number; y: number } {
  return ap.x !== undefined && ap.y !== undefined;
}

/**
 * Key of the shown floor, for what is stored per floor outside the geometry (uploaded plans):
 * the floor's name in a multi-floor geometry, an empty string for a single floor, undefined
 * when the floor is not in the geometry.
 */
export function floorKey(geometry: GeometryOption | undefined, floorName: string): string | undefined {
  if (geometry && 'floors' in geometry) {
    const names = Object.keys(geometry.floors ?? {});
    return geometry.floors[floorName] ? floorName : !floorName && names.length === 1 ? names[0] : undefined;
  }
  return '';
}

/** Replace the geometry of the shown floor, in either geometry format. */
export function updateFloor(
  geometry: GeometryOption | undefined,
  floorName: string,
  update: (floor: FloorGeometry) => FloorGeometry
): GeometryOption {
  if (geometry && 'floors' in geometry) {
    const key = floorKey(geometry, floorName);
    if (key === undefined) {
      return geometry;
    }
    return { floors: { ...geometry.floors, [key]: update(geometry.floors[key]) } };
  }
  return update(geometry ?? DEFAULT_GEOMETRY);
}

export function addWall(floor: FloorGeometry, wall: Wall): FloorGeometry {
  return { ...floor, walls: [...(floor.walls ?? []), wall] };
}

export function removeWalls(floor: FloorGeometry, indices: number[]): FloorGeometry {
  return { ...floor, walls: (floor.walls ?? []).filter((_, i) => !indices.includes(i)) };
}

export function moveWallEnd(floor: FloorGeometry, index: number, end: 'from' | 'to', point: RelPoint): FloorGeometry {
  return { ...floor, walls: (floor.walls ?? []).map((w, i) => (i === index ? { ...w, [end]: point } : w)) };
}

export function setWallsMaterial(floor: FloorGeometry, indices: number[], material: string): FloorGeometry {
  return { ...floor, walls: (floor.walls ?? []).map((w, i) => (indices.includes(i) ? { ...w, material } : w)) };
}

/**
 * Selection after a click on wall `index` (-1 for none): a plain click selects that wall alone,
 * Ctrl or Cmd adds it to the selection or removes it.
 */
export function clickSelection(selection: number[], index: number, add: boolean): number[] {
  if (!add) {
    return index >= 0 ? [index] : [];
  }
  if (index < 0) {
    return selection;
  }
  return selection.includes(index) ? selection.filter((i) => i !== index) : [...selection, index];
}

/** The material shared by every selected wall, or undefined when they differ. */
export function commonMaterial(walls: Wall[], selection: number[]): string | undefined {
  const materials = new Set(selection.map((i) => walls[i]?.material).filter(Boolean));
  return materials.size === 1 ? [...materials][0] : undefined;
}

/** Closest point of segment AB to P, and its distance. */
export function closestOnSegment(p: MPoint, a: MPoint, b: MPoint): { point: MPoint; distance: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const point: MPoint = [a[0] + t * dx, a[1] + t * dy];
  return { point, distance: Math.hypot(p[0] - point[0], p[1] - point[1]) };
}

/** Index of the wall closest to P within `toleranceM`, or -1. */
export function wallAt(p: MPoint, walls: Array<[MPoint, MPoint]>, toleranceM: number): number {
  let best = -1;
  let bestDistance = toleranceM;
  walls.forEach(([a, b], i) => {
    const { distance } = closestOnSegment(p, a, b);
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Snap P to the nearest wall end within `toleranceM`, else onto the nearest wall (to start or
 * end a wall against another one). Returns P unchanged when nothing is close.
 */
export function snapPoint(
  p: MPoint,
  walls: Array<[MPoint, MPoint]>,
  toleranceM: number
): { point: MPoint; snapped: boolean } {
  let best: MPoint | undefined;
  let bestDistance = toleranceM;
  for (const [a, b] of walls) {
    for (const end of [a, b]) {
      const d = Math.hypot(p[0] - end[0], p[1] - end[1]);
      if (d <= bestDistance) {
        best = end;
        bestDistance = d;
      }
    }
  }
  if (best) {
    return { point: best, snapped: true };
  }
  for (const [a, b] of walls) {
    const { point, distance } = closestOnSegment(p, a, b);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best ? { point: best, snapped: true } : { point: p, snapped: false };
}

/**
 * Make AB horizontal or vertical when it is within `toleranceDeg` of it, or always when `force`
 * (Shift held), by moving B.
 */
export function straighten(a: MPoint, b: MPoint, toleranceDeg: number, force = false): MPoint {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (angle <= toleranceDeg || (force && angle < 45)) {
    return [b[0], a[1]];
  }
  if (90 - angle <= toleranceDeg || (force && angle >= 45)) {
    return [a[0], b[1]];
  }
  return b;
}

/** Used for the what-if APs when no real AP has a radio on a band. */
export const DEFAULT_TX_POWER_DBM: Record<Band, number> = { '2.4GHz': 10, '5GHz': 16, '6GHz': 16 };

/** Radios for a what-if AP: the median transmit power of the real APs on each band. */
export function typicalRadios(aps: AccessPoint[]): Partial<Record<Band, Radio>> {
  const radios: Partial<Record<Band, Radio>> = {};
  for (const band of BANDS) {
    const powers = aps
      .map((ap) => ap.radios[band]?.txPowerDbm)
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
    const median = powers.length ? powers[Math.floor((powers.length - 1) / 2)] : DEFAULT_TX_POWER_DBM[band];
    radios[band] = { txPowerDbm: median };
  }
  return radios;
}

export function whatIfAp(aps: AccessPoint[], added: AccessPoint[], position: RelPoint): AccessPoint {
  let n = added.length + 1;
  while (added.some((ap) => ap.name === `What-if ${n}`)) {
    n++;
  }
  return {
    name: `What-if ${n}`,
    x: position[0],
    y: position[1],
    up: true,
    virtual: true,
    positionSource: 'panel',
    model: 'What-if AP',
    radios: typicalRadios(aps.filter((ap) => !ap.virtual)),
  };
}

/** The APs as the what-if scenario changes them: moved, switched on or off, added. */
export function applyWhatIf(aps: AccessPoint[], whatIf: WhatIf | undefined): AccessPoint[] {
  if (!whatIf) {
    return aps;
  }
  let typical: Partial<Record<Band, Radio>> | undefined;
  const changed = aps.map((ap) => {
    const moved = whatIf.moved[ap.name];
    const switched = whatIf.switched.includes(ap.name);
    if (!moved && !switched) {
      return ap;
    }
    const up = switched ? !ap.up : ap.up;
    let radios = ap.radios;
    if (switched && up) {
      // An AP the data reports down usually has no radio metrics: lend it the typical power.
      typical ??= typicalRadios(aps.filter((a) => !a.virtual));
      radios = { ...ap.radios };
      for (const band of BANDS) {
        if (radios[band]?.txPowerDbm === undefined) {
          radios[band] = { ...radios[band], txPowerDbm: typical[band]?.txPowerDbm };
        }
      }
    }
    return { ...ap, ...(moved ? { x: moved[0], y: moved[1], positionSource: 'panel' as const } : {}), up, radios };
  });
  return [...changed, ...whatIf.added];
}

/**
 * Floor size once a line measured on the plan is known to be `realM` long: both sides scale by
 * the same factor, so the plan keeps its proportions. To 0.1 m.
 */
export function scaleToLength(sizeM: [number, number], measuredM: number, realM: number): [number, number] {
  const factor = realM / measuredM;
  return [Math.round(sizeM[0] * factor * 10) / 10, Math.round(sizeM[1] * factor * 10) / 10];
}

/** The four walls of a rectangular room between two opposite corners, in metres. */
export function roomWalls(a: MPoint, b: MPoint, sizeM: [number, number], material: string): Wall[] {
  const corners: MPoint[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
  return corners.map((corner, i) => ({
    from: toRel(corner, sizeM),
    to: toRel(corners[(i + 1) % 4], sizeM),
    material,
  }));
}

export function addWalls(floor: FloorGeometry, walls: Wall[]): FloorGeometry {
  return { ...floor, walls: [...(floor.walls ?? []), ...walls] };
}
