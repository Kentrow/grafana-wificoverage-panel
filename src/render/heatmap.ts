import { CoverageGrid } from '../model/grid';
import { ViewWindow } from '../model/view';
import { Rgb, RssiScale } from './colors';

const WHOLE_FLOOR: ViewWindow = { x0: 0, x1: 1, y0: 0, y1: 1 };

/**
 * Grid coordinate of a pixel centre, with its neighbour and blend factor, for bilinear lookup. The
 * pixels span the part of the axis from `from` to `to`, as fractions of the floor.
 */
function axisLookup(
  pixels: number,
  cells: number,
  from = 0,
  to = 1
): { i0: Int32Array; i1: Int32Array; f: Float32Array } {
  const i0 = new Int32Array(pixels);
  const i1 = new Int32Array(pixels);
  const f = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const g = Math.min(cells - 1, Math.max(0, (from + ((p + 0.5) / pixels) * (to - from)) * cells - 0.5));
    i0[p] = Math.floor(g);
    i1[p] = Math.min(cells - 1, i0[p] + 1);
    f[p] = g - i0[p];
  }
  return { i0, i1, f };
}

/** Paint the best RSSI of the visible part of the floor, with bilinear smoothing between cell centres. */
export function paintRssi(image: ImageData, grid: CoverageGrid, scale: RssiScale, view = WHOLE_FLOOR): void {
  const { width, height, data } = image;
  const { cols, best } = grid;
  const xs = axisLookup(width, grid.cols, view.x0, view.x1);
  const ys = axisLookup(height, grid.rows, view.y0, view.y1);
  const { lut, min, step, size } = scale;
  const inv = 1 / step;

  for (let py = 0; py < height; py++) {
    const r0 = ys.i0[py] * cols;
    const r1 = ys.i1[py] * cols;
    const fy = ys.f[py];
    for (let px = 0; px < width; px++) {
      const c0 = xs.i0[px];
      const c1 = xs.i1[px];
      const fx = xs.f[px];
      const top = best[r0 + c0] + (best[r0 + c1] - best[r0 + c0]) * fx;
      const bottom = best[r1 + c0] + (best[r1 + c1] - best[r1 + c0]) * fx;
      const v = top + (bottom - top) * fy;
      const o = (py * width + px) * 4;
      const i = Math.round((v - min) * inv);
      if (i < 0) {
        data[o + 3] = 0;
        continue;
      }
      const l = (i < size ? i : size - 1) * 4;
      data[o] = lut[l];
      data[o + 1] = lut[l + 1];
      data[o + 2] = lut[l + 2];
      data[o + 3] = lut[l + 3];
    }
  }
}

/** Signal of AP `ap` in cell `i` when it is the best or second there; just below the second otherwise. */
function apValue(grid: CoverageGrid, i: number, ap: number): number {
  if (grid.bestAp[i] === ap) {
    return grid.bestRaw[i];
  }
  return grid.second[i] - (grid.secondAp[i] === ap ? 0 : 1);
}

/**
 * Paint one colour per dominant AP over the visible part of the floor, with a gap of `gap` between
 * the cells of two APs when given, where the signal is above `floorDbm`. Where the four cells
 * around a pixel disagree, the candidates' signals are interpolated and the strongest wins, so
 * cell boundaries are continuous lines instead of steps of the grid.
 */
export function paintBestAp(
  image: ImageData,
  grid: CoverageGrid,
  apColors: Rgb[],
  floorDbm: number,
  opacity: number,
  view = WHOLE_FLOOR,
  gap?: Rgb
): void {
  const { width, height, data } = image;
  const { cols, best, bestAp } = grid;
  const xs = axisLookup(width, grid.cols, view.x0, view.x1);
  const ys = axisLookup(height, grid.rows, view.y0, view.y1);
  const alpha = Math.round(opacity * 255);
  // The AP painted at each pixel, -1 where the map is clear, to find the boundaries between cells.
  const winners = new Int16Array(width * height).fill(-1);
  const cells = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];

  for (let py = 0; py < height; py++) {
    const r0 = ys.i0[py] * cols;
    const r1 = ys.i1[py] * cols;
    const fy = ys.f[py];
    for (let px = 0; px < width; px++) {
      const fx = xs.f[px];
      cells[0] = r0 + xs.i0[px];
      cells[1] = r0 + xs.i1[px];
      cells[2] = r1 + xs.i0[px];
      cells[3] = r1 + xs.i1[px];
      weights[0] = (1 - fx) * (1 - fy);
      weights[1] = fx * (1 - fy);
      weights[2] = (1 - fx) * fy;
      weights[3] = fx * fy;
      const o = (py * width + px) * 4;

      let level = 0;
      for (let k = 0; k < 4; k++) {
        level += weights[k] * best[cells[k]];
      }
      let winner = bestAp[cells[0]];
      if (winner !== bestAp[cells[1]] || winner !== bestAp[cells[2]] || winner !== bestAp[cells[3]]) {
        let strongest = -Infinity;
        for (let k = 0; k < 4; k++) {
          for (const candidate of [bestAp[cells[k]], grid.secondAp[cells[k]]]) {
            if (candidate < 0) {
              continue;
            }
            let value = 0;
            for (let j = 0; j < 4; j++) {
              value += weights[j] * apValue(grid, cells[j], candidate);
            }
            if (value > strongest) {
              strongest = value;
              winner = candidate;
            }
          }
        }
      }
      const color = apColors[winner];
      if (!color || level < floorDbm) {
        data[o + 3] = 0;
        continue;
      }
      winners[py * width + px] = winner;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = alpha;
    }
  }
  if (gap) {
    paintGaps(data, winners, width, height, gap);
  }
}

/**
 * A 2 px gap of the background colour where two APs' cells meet, the pixel on each side: the cells
 * stand apart whatever their colours, for every colour vision. None at the edge of the coverage.
 */
function paintGaps(data: Uint8ClampedArray, winners: Int16Array, width: number, height: number, gap: Rgb): void {
  const differs = (a: number, b: number) => a >= 0 && b >= 0 && a !== b;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const w = winners[i];
      const edge =
        (px > 0 && differs(w, winners[i - 1])) ||
        (px < width - 1 && differs(w, winners[i + 1])) ||
        (py > 0 && differs(w, winners[i - width])) ||
        (py < height - 1 && differs(w, winners[i + width]));
      if (edge) {
        data[i * 4] = gap[0];
        data[i * 4 + 1] = gap[1];
        data[i * 4 + 2] = gap[2];
        data[i * 4 + 3] = 255;
      }
    }
  }
}
