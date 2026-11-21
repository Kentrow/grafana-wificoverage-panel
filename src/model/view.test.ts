import { clampView, FULL_VIEW, MAX_ZOOM, panBy, visibleWindow, zoomAt } from './view';

const size: [number, number] = [60, 20];

describe('view', () => {
  it('shows the whole floor at zoom 1', () => {
    expect(visibleWindow(FULL_VIEW, size)).toEqual({ x0: 0, x1: 1, y0: 0, y1: 1 });
  });

  it('keeps the point under the pointer in place when zooming', () => {
    // Pointer at a quarter of the width and the middle of the height: 15 m, 10 m.
    const view = zoomAt(FULL_VIEW, size, 2, 0.25, 0.5);
    expect(view.zoom).toBe(2);
    // 30 x 10 m visible; 15 m stays a quarter of the way across, 10 m in the middle.
    expect(view.x + 0.25 * 30).toBeCloseTo(15);
    expect(view.y + 0.5 * 10).toBeCloseTo(10);
  });

  it('stays between the whole floor and the maximum zoom', () => {
    expect(zoomAt(FULL_VIEW, size, 0.5, 0.5, 0.5)).toEqual(FULL_VIEW);
    expect(zoomAt(FULL_VIEW, size, 1000, 0.5, 0.5).zoom).toBe(MAX_ZOOM);
  });

  it('pans by screen pixels and stops at the edges of the floor', () => {
    const zoomed = { zoom: 2, x: 10, y: 5 };
    // 10 px per metre at zoom 1, so 20 px per metre at zoom 2: dragging 40 px right shows 2 m further left.
    expect(panBy(zoomed, size, 40, 0, 10)).toEqual({ zoom: 2, x: 8, y: 5 });
    expect(panBy(zoomed, size, 10_000, -10_000, 10)).toEqual({ zoom: 2, x: 0, y: 10 });
  });

  it('brings a view that no longer fits back onto the floor', () => {
    expect(clampView({ zoom: 4, x: 100, y: -3 }, size)).toEqual({ zoom: 4, x: 45, y: 0 });
    expect(clampView({ zoom: 0.5, x: 3, y: 3 }, size)).toEqual(FULL_VIEW);
  });

  it('gives the visible part of the floor as fractions', () => {
    expect(visibleWindow({ zoom: 2, x: 15, y: 5 }, size)).toEqual({ x0: 0.25, x1: 0.75, y0: 0.25, y1: 0.75 });
  });
});
