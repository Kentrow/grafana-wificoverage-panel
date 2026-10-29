/**
 * Resolve a floor plan URL the way the Canvas panel resolves its images, so the demo's
 * existing values keep working:
 * - absolute URLs (`https://...`, `data:...`) and root paths (`/...`) are kept;
 * - `public/...` is served by Grafana, under its sub path if any;
 * - other relative paths are relative to Grafana's build folder, so `../floorplans/a.svg`
 *   means `public/floorplans/a.svg`.
 */
export function resolvePlanUrl(url: string, appSubUrl: string): string {
  const trimmed = url.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  const sub = appSubUrl.replace(/\/$/, '');
  if (trimmed.startsWith('public/')) {
    return `${sub}/${trimmed}`;
  }
  const resolved = new URL(trimmed, `http://grafana${sub}/public/build/`);
  return resolved.pathname + resolved.search + resolved.hash;
}
