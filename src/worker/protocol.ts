import type { CoverageGrid, GridInput } from '../model/grid';

export interface GridRequest {
  id: number;
  input: GridInput;
}

export type GridResponse =
  { id: number; grid: CoverageGrid; elapsedMs: number; error?: undefined } | { id: number; error: string };
