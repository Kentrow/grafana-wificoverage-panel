import { resolvePlanUrl } from './planUrl';

describe('resolvePlanUrl', () => {
  it('keeps absolute URLs and root paths', () => {
    expect(resolvePlanUrl('https://example.com/a.svg', '')).toBe('https://example.com/a.svg');
    expect(resolvePlanUrl('data:image/svg+xml;base64,AAA', '')).toBe('data:image/svg+xml;base64,AAA');
    expect(resolvePlanUrl('/plans/a.svg', '/grafana')).toBe('/plans/a.svg');
  });

  it('serves public/ paths under the sub path', () => {
    expect(resolvePlanUrl('public/floorplans/hq-f1.svg', '')).toBe('/public/floorplans/hq-f1.svg');
    expect(resolvePlanUrl('public/floorplans/a.svg', '/grafana/')).toBe('/grafana/public/floorplans/a.svg');
  });

  it('resolves other relative paths like the Canvas panel', () => {
    expect(resolvePlanUrl('../floorplans/hq-f1.svg', '')).toBe('/public/floorplans/hq-f1.svg');
    expect(resolvePlanUrl('../floorplans/a.svg', '/grafana')).toBe('/grafana/public/floorplans/a.svg');
  });

  it('returns nothing for an empty option', () => {
    expect(resolvePlanUrl('  ', '')).toBe('');
  });
});
