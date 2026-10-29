import { CoverageGrid } from '../model/grid';
import { paintBestAp } from './heatmap';

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
});
