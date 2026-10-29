import { useEffect, useRef, useState } from 'react';
import { computeGrid, CoverageGrid, GridInput } from '../model/grid';
import type { GridRequest, GridResponse } from './protocol';

export interface GridResult {
  grid: CoverageGrid;
  elapsedMs: number;
  inWorker: boolean;
}

function startWorker(): Worker | undefined {
  try {
    // Webpack 5 emits the worker as its own chunk, under the plugin's public path. Plugins are built
    // as AMD modules, but a worker has no `define`: give its chunk a plain script format instead.
    return new Worker(
      /* webpackChunkName: "grid-worker", webpackEntryOptions: { library: { type: "var", name: "wifiCoverageGrid" } } */
      new URL('./grid.worker.ts', import.meta.url)
    );
  } catch {
    return undefined;
  }
}

/**
 * Runs one computation at a time and keeps only the latest request waiting, so a stream of
 * requests (an AP being dragged) never piles up: the map follows at the speed of the computation.
 * Falls back to the main thread when the worker cannot start or fails.
 */
class GridClient {
  private worker?: Worker;
  private inFlight?: GridRequest;
  private pending?: GridRequest;
  private timer?: ReturnType<typeof setTimeout>;
  private nextId = 0;
  private shownId = 0;
  private disposed = false;

  constructor(private onResult: (result: GridResult) => void) {
    this.worker = startWorker();
    this.worker?.addEventListener('message', this.onMessage);
    this.worker?.addEventListener('error', this.onError);
  }

  submit(input: GridInput) {
    this.pending = { id: ++this.nextId, input };
    this.flush();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.worker?.terminate();
  }

  private flush() {
    if (this.inFlight || !this.pending || this.disposed) {
      return;
    }
    const request = this.pending;
    this.pending = undefined;
    this.inFlight = request;
    if (this.worker) {
      this.worker.postMessage(request);
      return;
    }
    // Main thread: yield first, so the latest of a burst of requests is the one computed.
    this.timer = setTimeout(() => {
      const start = performance.now();
      let result: GridResult | undefined;
      try {
        result = { grid: computeGrid(request.input), elapsedMs: performance.now() - start, inWorker: false };
      } catch {
        // Keep the last map; the next request gets its chance.
      }
      this.done(request.id, result);
    }, 0);
  }

  /** A request is over; `result` is undefined when its computation failed. */
  private done(id: number, result: GridResult | undefined) {
    this.inFlight = undefined;
    if (result && !this.disposed && id > this.shownId) {
      this.shownId = id;
      this.onResult(result);
    }
    this.flush();
  }

  private onMessage = (event: MessageEvent<GridResponse>) => {
    const response = event.data;
    this.done(
      response.id,
      response.error === undefined ? { grid: response.grid, elapsedMs: response.elapsedMs, inWorker: true } : undefined
    );
  };

  private onError = (event: Event) => {
    event.preventDefault();
    // The worker chunk could not load or crashed: compute here from now on, starting with the lost request.
    this.worker?.terminate();
    this.worker = undefined;
    if (this.inFlight && !this.pending) {
      this.pending = this.inFlight;
    }
    this.inFlight = undefined;
    this.flush();
  };
}

/** Compute the coverage grid of `input` off the main thread; the latest result wins. */
export function useCoverageGrid(input: GridInput | undefined): GridResult | undefined {
  const [result, setResult] = useState<GridResult>();
  const client = useRef<GridClient | null>(null);

  useEffect(() => {
    const c = new GridClient(setResult);
    client.current = c;
    return () => {
      c.dispose();
      client.current = null;
    };
  }, []);

  useEffect(() => {
    if (input) {
      client.current?.submit(input);
    }
  }, [input]);

  return input ? result : undefined;
}
