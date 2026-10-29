import { computeGrid } from '../model/grid';
import type { GridRequest, GridResponse } from './protocol';

self.onmessage = (event: MessageEvent<GridRequest>) => {
  const { id, input } = event.data;
  const start = performance.now();
  let grid;
  try {
    grid = computeGrid(input);
  } catch (e) {
    // Answer anyway: the client must not wait forever for this request.
    const response: GridResponse = { id, error: e instanceof Error ? e.message : String(e) };
    self.postMessage(response);
    return;
  }
  const response: GridResponse = { id, grid, elapsedMs: performance.now() - start };
  self.postMessage(response, {
    transfer: [grid.best.buffer, grid.bestRaw.buffer, grid.second.buffer, grid.bestAp.buffer, grid.secondAp.buffer],
  });
};
