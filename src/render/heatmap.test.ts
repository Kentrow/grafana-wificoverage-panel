import { CoverageGrid } from '../model/grid';
import { buildRssiScale } from './colors';
import { paintBestAp, paintRssi } from './heatmap';

const image = (width: number, height: number) =>
  ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData;

describe('paintBestAp', () => {
  // Two cells: AP 0 dominates the left one, AP 1 the right one, each second in the other cell.
  const grid: CoverageGrid = {
    cols: 2,
    rows: 1,
    resolutionM: 1,
    best: new Float32Array([-50, -50]),
    bestRaw: new Float32Array([-50, -50]),
    second: new Float32Array([-70, -70]),
    bestAp: new Int16Array([0, 1]),
    secondAp: new Int16Array([1, 0]),
  };
  const colors: Array<[number, number, number]> = [
    [255, 0, 0],
    [0, 0, 255],
  ];

  it('splits the plan between the dominant APs where their signals cross', () => {
    const img = image(8, 1);
    paintBestAp(img, grid, colors, -90, 1);
    const reds = Array.from({ length: 8 }, (_, i) => img.data[i * 4] === 255);
    expect(reds).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('leaves the plan clear below the floor', () => {
    const img = image(4, 1);
    paintBestAp(img, grid, colors, -40, 1);
    expect(Array.from({ length: 4 }, (_, i) => img.data[i * 4 + 3])).toEqual([0, 0, 0, 0]);
  });

  it('paints only the visible part of the floor when zoomed', () => {
    // The right half of the floor on 4 pixels: what the full floor shows on its last 4 of 8.
    const img = image(4, 1);
    paintBestAp(img, grid, colors, -90, 1, { x0: 0.5, x1: 1, y0: 0, y1: 1 });
    expect(Array.from({ length: 4 }, (_, i) => img.data[i * 4] === 255)).toEqual([false, false, false, false]);
  });
});

describe('paintRssi', () => {
  it('paints the visible part of the floor as the matching part of the full map', () => {
    const grid: CoverageGrid = {
      cols: 4,
      rows: 2,
      resolutionM: 1,
      best: new Float32Array([-50, -60, -70, -80, -55, -65, -75, -85]),
      bestRaw: new Float32Array(8),
      second: new Float32Array(8),
      bestAp: new Int16Array(8),
      secondAp: new Int16Array(8),
    };
    const colors = { excellent: '#004400', good: '#00ff00', fair: '#ffff00', weak: '#ff8800', bad: '#ff0000' };
    const scale = buildRssiScale({ good: -67, fair: -75, weak: -82, floor: -90 }, colors, 'gradient', 1);
    const full = image(16, 8);
    paintRssi(full, grid, scale);
    const zoomed = image(8, 4);
    paintRssi(zoomed, grid, scale, { x0: 0.5, x1: 1, y0: 0.5, y1: 1 });
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 8; x++) {
        const a = ((y + 4) * 16 + x + 8) * 4;
        const b = (y * 8 + x) * 4;
        expect(Array.from(zoomed.data.slice(b, b + 4))).toEqual(Array.from(full.data.slice(a, a + 4)));
      }
    }
  });
});
