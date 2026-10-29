/**
 * True when segment AB crosses segment CD, ends included.
 * Parallel segments never cross: a ray running along a wall does not go through it.
 */
export function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (denom === 0) {
    return false;
  }
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}
