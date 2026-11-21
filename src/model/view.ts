/**
 * The part of the floor shown in the panel: a zoom factor and the top left corner of the visible
 * part, in metres. Zoom 1 shows the whole floor. Never saved: it belongs to the viewer.
 */
export interface View {
  zoom: number;
  x: number;
  y: number;
}

export const FULL_VIEW: View = { zoom: 1, x: 0, y: 0 };

export const MAX_ZOOM = 8;

/** The visible part of the floor as fractions of its size, 0 to 1 on each axis. */
export interface ViewWindow {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The view brought back within zoom 1 to MAX_ZOOM and onto the floor. */
export function clampView({ zoom, x, y }: View, [widthM, heightM]: [number, number]): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  if (z === 1) {
    return FULL_VIEW;
  }
  return {
    zoom: z,
    x: Math.min(widthM - widthM / z, Math.max(0, x)),
    y: Math.min(heightM - heightM / z, Math.max(0, y)),
  };
}

/**
 * Zoom by `factor` around the point under the pointer, given as a fraction of the shown part
 * (`fx`, `fy` from 0 to 1): that point stays under the pointer.
 */
export function zoomAt(view: View, sizeM: [number, number], factor: number, fx: number, fy: number): View {
  const [widthM, heightM] = sizeM;
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * factor));
  const px = view.x + (fx * widthM) / view.zoom;
  const py = view.y + (fy * heightM) / view.zoom;
  return clampView({ zoom, x: px - (fx * widthM) / zoom, y: py - (fy * heightM) / zoom }, sizeM);
}

/** Move the view with a drag of `dx`, `dy` screen pixels, `pxPerM` being the scale at zoom 1. */
export function panBy(view: View, sizeM: [number, number], dx: number, dy: number, pxPerM: number): View {
  const k = pxPerM * view.zoom;
  return clampView({ ...view, x: view.x - dx / k, y: view.y - dy / k }, sizeM);
}

export function visibleWindow({ zoom, x, y }: View, [widthM, heightM]: [number, number]): ViewWindow {
  return { x0: x / widthM, x1: (x + widthM / zoom) / widthM, y0: y / heightM, y1: (y + heightM / zoom) / heightM };
}
