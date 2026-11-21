import { act, renderHook, waitFor } from '@testing-library/react';
import { GridInput } from '../model/grid';
import { DEFAULT_BAND_MODELS } from '../model/propagation';
import { crossOriginWorkerClass, useCoverageGrid } from './useCoverageGrid';

jest.mock('../model/grid', () => {
  const actual = jest.requireActual('../model/grid');
  return {
    ...actual,
    // A floor 999 m wide stands for a computation that fails, such as an allocation error.
    computeGrid: (input: GridInput) => {
      if (input.widthM === 999) {
        throw new RangeError('Array buffer allocation failed');
      }
      return actual.computeGrid(input);
    },
  };
});

const input = (widthM: number): GridInput => ({
  widthM,
  heightM: 10,
  resolutionM: 1,
  model: DEFAULT_BAND_MODELS['5GHz'],
  aps: [{ index: 0, xM: 5, yM: 5, txPowerDbm: 16 }],
  walls: [],
});

describe('useCoverageGrid', () => {
  // jsdom has no Worker: the hook computes on the main thread, as when the worker fails to load.
  it('keeps computing after a computation fails', async () => {
    const { result, rerender } = renderHook(({ i }) => useCoverageGrid(i), { initialProps: { i: input(20) } });
    await waitFor(() => expect(result.current?.grid.cols).toBe(20));
    await act(async () => rerender({ i: input(999) }));
    await act(async () => rerender({ i: input(30) }));
    await waitFor(() => expect(result.current?.grid.cols).toBe(30));
  });
});

describe('crossOriginWorkerClass', () => {
  /** Stands for the browser's Worker: records the URL it is started from. */
  class FakeWorker {
    url: string | URL;
    constructor(url: string | URL) {
      this.url = url;
    }
  }
  const CrossOrigin = crossOriginWorkerClass(FakeWorker as unknown as typeof Worker);

  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:http://localhost/1');
  });

  it('starts a same-origin script directly', () => {
    const worker = new CrossOrigin(`${location.origin}/public/plugins/p/grid-worker.js`) as unknown as FakeWorker;
    expect(String(worker.url)).toBe(`${location.origin}/public/plugins/p/grid-worker.js`);
  });

  it('loads a script from another origin through a same-origin blob', async () => {
    const worker = new CrossOrigin('https://cdn.example.com/p/grid-worker.js?_cache=1') as unknown as FakeWorker;
    expect(worker.url).toBe('blob:http://localhost/1');
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    // jsdom's Blob has no text().
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(text).toBe('importScripts("https://cdn.example.com/p/grid-worker.js?_cache=1");');
  });
});
