import { BandModel } from '../types';
import { distance, segmentsIntersect } from './geometry';
import { NO_SIGNAL_DBM, referenceRssi, MIN_DISTANCE_M } from './propagation';

// Module-level aliases: the hot loops below run millions of times, and global lookups are slow in
// some runtimes (Jest runs code in a vm context, where they cost more than the arithmetic).
const { max, min, ceil, floor, log10, sqrt } = Math;
const INF = Number.POSITIVE_INFINITY;

/** A transmitting radio, in metres. */
export interface SceneAp {
  index: number;
  xM: number;
  yM: number;
  txPowerDbm: number;
}

/** A wall in metres, with its loss already resolved for the band. */
export interface SceneWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lossDb: number;
}

export interface GridInput {
  widthM: number;
  heightM: number;
  resolutionM: number;
  model: BandModel;
  aps: SceneAp[];
  walls: SceneWall[];
}

/**
 * Best and second best signal on a regular grid. Cell (col, row) is centred on
 * ((col + 0.5) * resolution, (row + 0.5) * resolution) metres and stored at row * cols + col.
 */
export interface CoverageGrid {
  cols: number;
  rows: number;
  resolutionM: number;
  /** Best signal, smoothed for display. */
  best: Float32Array;
  /** Best signal before smoothing, comparable with `second`. */
  bestRaw: Float32Array;
  second: Float32Array;
  /** Index into the scene APs, -1 when no AP reaches the cell. */
  bestAp: Int16Array;
  secondAp: Int16Array;
}

export interface PointSignal {
  apIndex: number;
  rssiDbm: number;
  distanceM: number;
  walls: number;
}

/** Above this the resolution is coarsened: memory and time grow with the cell count. */
export const MAX_CELLS = 1_000_000;

/** The requested resolution, coarsened if needed to keep the grid under MAX_CELLS. */
export function effectiveResolution(widthM: number, heightM: number, resolutionM: number): number {
  return max(resolutionM, sqrt((widthM * heightM) / MAX_CELLS));
}

export function gridSize(widthM: number, heightM: number, resolutionM: number) {
  return { cols: max(1, ceil(widthM / resolutionM)), rows: max(1, ceil(heightM / resolutionM)) };
}

/**
 * Wall losses are averaged over rays cast from a few points around the AP, so a shadow gets a
 * penumbra that widens with distance instead of a hard edge: a cheap stand-in for diffraction
 * around wall ends and through doors.
 */
export const SOFT_SHADOW_RADIUS_M = 1;
const SHADOW_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [SOFT_SHADOW_RADIUS_M, 0],
  [-SOFT_SHADOW_RADIUS_M, 0],
  [0, SOFT_SHADOW_RADIUS_M],
  [0, -SOFT_SHADOW_RADIUS_M],
];

/** Mean wall loss in dB between the AP and a point, over the soft shadow rays. */
export function wallLoss(ap: SceneAp, walls: SceneWall[], xM: number, yM: number): number {
  let total = 0;
  for (const [ox, oy] of SHADOW_OFFSETS) {
    const ax = ap.xM + ox;
    const ay = ap.yM + oy;
    for (const w of walls) {
      if (segmentsIntersect(ax, ay, xM, yM, w.x1, w.y1, w.x2, w.y2)) {
        total += w.lossDb;
      }
    }
  }
  return total / SHADOW_OFFSETS.length;
}

const STRIDE = 12;

/**
 * The grid's fast path for `wallLoss`. A ray from origin A to P crosses wall CD when P is not on
 * A's side of the line CD and lies in the cone from A through C and D: three half-planes. On one
 * grid row their intersection is an interval of columns, found with a few operations, so the cost
 * follows the area of the shadows instead of cells times walls.
 */
class ShadowCaster {
  private readonly pairs: Float64Array;
  private readonly count: number;
  /** Loss of the walls an origin sits on: every ray from it crosses them. */
  private everywhere = 0;

  constructor(ap: SceneAp, walls: SceneWall[]) {
    this.pairs = new Float64Array(SHADOW_OFFSETS.length * walls.length * STRIDE);
    let k = 0;
    for (const [ox, oy] of SHADOW_OFFSETS) {
      const ax = ap.xM + ox;
      const ay = ap.yM + oy;
      for (const w of walls) {
        const nx = -(w.y2 - w.y1);
        const ny = w.x2 - w.x1;
        if (nx === 0 && ny === 0) {
          // A wall of zero length stops nothing, as in segmentsIntersect.
          continue;
        }
        const sideA = nx * (ax - w.x1) + ny * (ay - w.y1);
        if (sideA === 0) {
          // On the wall's line: rays cross the wall only if the origin is on the wall itself.
          const t = (ax - w.x1) * (w.x2 - w.x1) + (ay - w.y1) * (w.y2 - w.y1);
          if (t >= 0 && t <= (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2) {
            this.everywhere += w.lossDb;
          }
          continue;
        }
        const ux = w.x1 - ax;
        const uy = w.y1 - ay;
        const vx = w.x2 - ax;
        const vy = w.y2 - ay;
        // Orient the cone so that "inside" is always a positive cross product.
        const sign = ux * vy - uy * vx < 0 ? -1 : 1;
        this.pairs.set(
          [ax, ay, w.x1, w.y1, nx, ny, Math.sign(sideA), ux * sign, uy * sign, vx * sign, vy * sign, w.lossDb],
          k * STRIDE
        );
        k++;
      }
    }
    this.count = k;
  }

  /** Mean wall loss in dB at every cell centre of the grid, as `wallLoss`, into `out`. */
  fill(out: Float32Array, cols: number, rows: number, resolutionM: number): void {
    const p = this.pairs;
    // Per row, each shadow interval adds +loss at its first column and -loss after its last:
    // a running sum then gives every cell's loss, whatever the size of the shadows.
    const delta = new Float64Array(cols + 1);
    const interval = (a: number, b: number, range: [number, number]) => {
      if (a > 0) {
        range[0] = max(range[0], -b / a);
      } else if (a < 0) {
        range[1] = min(range[1], -b / a);
      } else if (b < 0) {
        range[1] = -INF;
      }
    };
    const range: [number, number] = [0, 0];
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * resolutionM;
      delta.fill(0);
      for (let k = 0, o = 0; k < this.count; k++, o += STRIDE) {
        const ax = p[o];
        const dy = y - p[o + 1];
        const side = p[o + 6];
        range[0] = -INF;
        range[1] = INF;
        // Each constraint is a * x + b >= 0 along the row: beyond the wall, then inside the cone.
        interval(-p[o + 4] * side, -side * (p[o + 5] * (y - p[o + 3]) - p[o + 4] * p[o + 2]), range);
        interval(-p[o + 8], p[o + 7] * dy + p[o + 8] * ax, range);
        interval(p[o + 10], -ax * p[o + 10] - dy * p[o + 9], range);
        if (range[0] > range[1]) {
          continue;
        }
        const first = max(0, ceil(range[0] / resolutionM - 0.5));
        const last = min(cols - 1, floor(range[1] / resolutionM - 0.5));
        if (first <= last) {
          delta[first] += p[o + 11];
          delta[last + 1] -= p[o + 11];
        }
      }
      const base = row * cols;
      let running = this.everywhere;
      for (let col = 0; col < cols; col++) {
        running += delta[col];
        out[base + col] = running;
      }
    }
    for (let i = 0; i < out.length; i++) {
      out[i] /= SHADOW_OFFSETS.length;
    }
  }
}

/** Signal of one AP at a point, walls included. `walls` counts the walls on the direct line. */
export function apSignal(ap: SceneAp, walls: SceneWall[], model: BandModel, xM: number, yM: number): PointSignal {
  const d = distance(ap.xM, ap.yM, xM, yM);
  const crossed = walls.filter((w) => segmentsIntersect(ap.xM, ap.yM, xM, yM, w.x1, w.y1, w.x2, w.y2)).length;
  const rssiDbm =
    referenceRssi(ap.txPowerDbm, model) -
    10 * model.exponent * log10(max(d, MIN_DISTANCE_M)) -
    wallLoss(ap, walls, xM, yM);
  return { apIndex: ap.index, rssiDbm, distanceM: d, walls: crossed };
}

/** Every AP's signal at a point, strongest first. */
export function signalsAt(input: Pick<GridInput, 'aps' | 'walls' | 'model'>, xM: number, yM: number): PointSignal[] {
  return input.aps.map((ap) => apSignal(ap, input.walls, input.model, xM, yM)).sort((a, b) => b.rssiDbm - a.rssiDbm);
}

/** Values below this are all "no signal" for display; clamping keeps the smoothing from eating into coverage. */
const SMOOTH_FLOOR_DBM = -120;

/**
 * Two passes of a separable [1 2 1] / 4 blur, in place: smooths the steps left by the grid
 * along shadow edges, over about a metre at the default resolution.
 */
export function smoothGrid(values: Float32Array, cols: number, rows: number, passes = 2): void {
  const tmp = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    values[i] = max(values[i], SMOOTH_FLOOR_DBM);
  }
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < rows; r++) {
      const o = r * cols;
      for (let c = 0; c < cols; c++) {
        const l = values[o + max(0, c - 1)];
        const rt = values[o + min(cols - 1, c + 1)];
        tmp[o + c] = (l + 2 * values[o + c] + rt) / 4;
      }
    }
    for (let r = 0; r < rows; r++) {
      const up = max(0, r - 1) * cols;
      const down = min(rows - 1, r + 1) * cols;
      const o = r * cols;
      for (let c = 0; c < cols; c++) {
        values[o + c] = (tmp[up + c] + 2 * tmp[o + c] + tmp[down + c]) / 4;
      }
    }
  }
}

export function computeGrid(input: GridInput, { smooth = true } = {}): CoverageGrid {
  const { widthM, heightM, model, aps, walls } = input;
  const resolutionM = effectiveResolution(widthM, heightM, input.resolutionM);
  const { cols, rows } = gridSize(widthM, heightM, resolutionM);
  const n = cols * rows;
  const best = new Float32Array(n).fill(NO_SIGNAL_DBM);
  const second = new Float32Array(n).fill(NO_SIGNAL_DBM);
  const bestAp = new Int16Array(n).fill(-1);
  const secondAp = new Int16Array(n).fill(-1);
  const tenN = 10 * model.exponent;
  const losses = new Float32Array(n);

  for (const ap of aps) {
    const ref = referenceRssi(ap.txPowerDbm, model);
    new ShadowCaster(ap, walls).fill(losses, cols, rows, resolutionM);
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * resolutionM;
      for (let col = 0; col < cols; col++) {
        const x = (col + 0.5) * resolutionM;
        const d = max(sqrt((x - ap.xM) ** 2 + (y - ap.yM) ** 2), MIN_DISTANCE_M);
        let value = ref - tenN * log10(d);
        const i = row * cols + col;
        // Even without walls this AP cannot beat the second best here: skip the wall tests.
        if (value <= second[i]) {
          continue;
        }
        value -= losses[i];
        if (value > best[i]) {
          second[i] = best[i];
          secondAp[i] = bestAp[i];
          best[i] = value;
          bestAp[i] = ap.index;
        } else if (value > second[i]) {
          second[i] = value;
          secondAp[i] = ap.index;
        }
      }
    }
  }
  const bestRaw = best.slice();
  if (smooth && aps.length > 0) {
    smoothGrid(best, cols, rows);
  }
  return { cols, rows, resolutionM, best, bestRaw, second, bestAp, secondAp };
}
