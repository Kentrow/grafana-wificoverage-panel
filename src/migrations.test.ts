import { PanelModel } from '@grafana/data';
import { migrateOptions } from './migrations';
import { CoverageOptions } from './types';

const panel = (options: object) =>
  ({ id: 1, options, fieldConfig: { defaults: {}, overrides: [] } }) as unknown as PanelModel<Partial<CoverageOptions>>;

describe('migrateOptions', () => {
  it('drops the default single-floor keys merged into a multi-floor geometry', () => {
    const floors = { 'hq-f1': { size_m: [100, 40], walls: [] } };
    const migrated = migrateOptions(panel({ band: '5GHz', geometry: { size_m: [62, 24], walls: [], floors } }));
    expect(migrated).toEqual({ band: '5GHz', geometry: { floors } });
  });

  it('leaves current options alone', () => {
    const options = { geometry: { size_m: [62, 24], walls: [] }, apPositions: { a: [0.1, 0.2] } };
    expect(migrateOptions(panel(options))).toEqual(options);
    expect(migrateOptions(panel({}))).toEqual({});
  });
});
