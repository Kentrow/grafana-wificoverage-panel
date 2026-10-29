import { CoverageGrid } from '../model/grid';
import { Rgb, RssiScale } from './colors';

/** Grid coordinate of a pixel centre, with its neighbour and blend factor, for bilinear lookup. */
function axisLookup(pixels: number, cells: number): { i0: Int32Array; i1: Int32Array; f: Float32Array } {
  const i0 = new Int32Array(pixels);
  const i1 = new Int32Array(pixels);
  const f = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const g = Math.min(cells - 1, Math.max(0, ((p + 0.5) / pixels) * cells - 0.5));
    i0[p] = Math.floor(g);
    i1[p] = Math.min(cells - 1, i0[p] + 1);
    f[p] = g - i0[p];
  }
  return { i0, i1, f };
}

/** Paint the best RSSI with bilinear smoothing between cell centres. */
export function paintRssi(image: ImageData, grid: CoverageGrid, scale: RssiScale): void {
  const { width, height, data } = image;
  const { cols, best } = grid;
  const xs = axisLookup(width, grid.cols);
  const ys = axisLookup(height, grid.rows);
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
 * Paint one colour per dominant AP, where the signal is above `floorDbm`. Where the four cells
 * around a pixel disagree, the candidates' signals are interpolated and the strongest wins, so
 * cell boundaries are continuous lines instead of steps of the grid.
 */
export function paintBestAp(
  image: ImageData,
  grid: CoverageGrid,
  apColors: Rgb[],
  floorDbm: number,
  opacity: number
): void {
  const { width, height, data } = image;
  const { cols, best, bestAp } = grid;
  const xs = axisLookup(width, grid.cols);
  const ys = axisLookup(height, grid.rows);
  const alpha = Math.round(opacity * 255);
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
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = alpha;
    }
  }
}
