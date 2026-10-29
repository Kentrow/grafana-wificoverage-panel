import { AccessPoint, Band, BandModel, FloorGeometry, GeometryOption, MaterialTable, Wall } from '../types';
import { GridInput, SceneAp, SceneWall } from './grid';

/** Floors outside these sizes are typos: they would make the grid empty or enormous. */
export const MIN_FLOOR_M = 1;
export const MAX_FLOOR_M = 5000;

export const DEFAULT_GEOMETRY: FloorGeometry = { size_m: [62, 24], walls: [] };

function isPoint(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function floorErrors(f: unknown, where: string): string[] {
  if (typeof f !== 'object' || f === null) {
    return [`${where} must be an object.`];
  }
  const floor = f as Partial<FloorGeometry>;
  const errors: string[] = [];
  const size = floor.size_m;
  const inRange = (v: number) => v >= MIN_FLOOR_M && v <= MAX_FLOOR_M;
  if (!isPoint(size) || !inRange(size[0]) || !inRange(size[1])) {
    errors.push(`${where}.size_m must be [width, height] in metres, from ${MIN_FLOOR_M} to ${MAX_FLOOR_M}.`);
  }
  if (floor.walls !== undefined && !Array.isArray(floor.walls)) {
    errors.push(`${where}.walls must be a list.`);
  }
  (Array.isArray(floor.walls) ? floor.walls : []).forEach((w: Partial<Wall>, i) => {
    if (!isPoint(w?.from) || !isPoint(w?.to)) {
      errors.push(`${where}.walls[${i}] needs "from" and "to" as [x, y] between 0 and 1.`);
    }
    if (typeof w?.material !== 'string') {
      errors.push(`${where}.walls[${i}] needs a "material".`);
    }
  });
  return errors;
}

/** Errors in a geometry option, as sentences for the editor. Empty when valid. */
export function validateGeometry(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['Geometry must be a JSON object.'];
  }
  if ('floors' in value) {
    const floors = (value as { floors: unknown }).floors;
    if (typeof floors !== 'object' || floors === null) {
      return ['"floors" must map each floor name to its geometry.'];
    }
    return Object.entries(floors).flatMap(([name, f]) => floorErrors(f, `floors["${name}"]`));
  }
  return floorErrors(value, 'geometry');
}

/** Pick the floor geometry: the single one, or the one named `floor` in a multi-floor option. */
export function resolveFloor(geometry: GeometryOption | undefined, floor: string): FloorGeometry | string {
  if (!geometry) {
    return DEFAULT_GEOMETRY;
  }
  if ('floors' in geometry) {
    const names = Object.keys(geometry.floors ?? {});
    const match = geometry.floors?.[floor];
    if (match) {
      return match;
    }
    if (!floor && names.length === 1) {
      return geometry.floors[names[0]];
    }
    return floor
      ? `No geometry for floor "${floor}". Known floors: ${names.join(', ') || 'none'}.`
      : 'Set the Floor option to pick one of the floors in the geometry.';
  }
  return geometry;
}

export interface Scene {
  input: GridInput;
  /** Wall materials missing from the material table, counted as 0 dB. */
  unknownMaterials: string[];
}

export function buildScene(
  aps: AccessPoint[],
  floor: FloorGeometry,
  band: Band,
  model: BandModel,
  materials: MaterialTable,
  resolutionM: number
): Scene {
  const [widthM, heightM] = floor.size_m;
  const unknown = new Set<string>();

  const sceneAps: SceneAp[] = [];
  aps.forEach((ap, index) => {
    const tx = ap.radios[band]?.txPowerDbm;
    if (ap.up && tx !== undefined && ap.x !== undefined && ap.y !== undefined) {
      sceneAps.push({ index, xM: ap.x * widthM, yM: ap.y * heightM, txPowerDbm: tx });
    }
  });

  const walls: SceneWall[] = (floor.walls ?? []).map((w) => {
    const loss = materials[w.material]?.[band];
    if (loss === undefined) {
      unknown.add(w.material);
    }
    return {
      x1: w.from[0] * widthM,
      y1: w.from[1] * heightM,
      x2: w.to[0] * widthM,
      y2: w.to[1] * heightM,
      lossDb: loss ?? 0,
    };
  });

  return {
    input: { widthM, heightM, resolutionM, model, aps: sceneAps, walls },
    unknownMaterials: Array.from(unknown),
  };
}
