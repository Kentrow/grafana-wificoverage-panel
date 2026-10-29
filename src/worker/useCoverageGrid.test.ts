import { act, renderHook, waitFor } from '@testing-library/react';
import { GridInput } from '../model/grid';
import { DEFAULT_BAND_MODELS } from '../model/propagation';
import { useCoverageGrid } from './useCoverageGrid';

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
