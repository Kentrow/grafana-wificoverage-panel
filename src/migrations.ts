import { PanelModel } from '@grafana/data';
import { CoverageOptions } from './types';

/**
 * Brings the options saved by an older version of the plugin up to date. Grafana calls it when
 * the plugin version saved with the panel differs from the installed one; the dashboard keeps the
 * migrated options once saved. Add steps here whenever the options change shape.
 */
export function migrateOptions(panel: PanelModel<Partial<CoverageOptions>>): Partial<CoverageOptions> {
  const options = { ...panel.options };
  const geometry = options.geometry as Record<string, unknown> | undefined;

  // Before 0.1.0 the geometry option had a default value, which Grafana merged into saved
  // multi-floor geometries: drop the stray single-floor keys next to `floors`.
  if (
    geometry &&
    typeof geometry === 'object' &&
    'floors' in geometry &&
    ('size_m' in geometry || 'walls' in geometry)
  ) {
    const { size_m: _size, walls: _walls, ...rest } = geometry;
    options.geometry = rest as unknown as CoverageOptions['geometry'];
  }

  return options;
}
