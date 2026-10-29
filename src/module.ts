import { FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { CoveragePanel, DEFAULT_THRESHOLDS } from './components/CoveragePanel';
import { JsonOptionEditor } from './components/JsonOptionEditor';
import { PlanImagesEditor } from './components/PlanImagesEditor';
import { migrateOptions } from './migrations';
import { DEFAULT_BAND_MODELS, DEFAULT_MATERIALS } from './model/propagation';
import { validateGeometry } from './model/scene';
import { BANDS, CoverageOptions } from './types';

const FLOOR = ['Floor'];
const COVERAGE = ['Coverage'];
const DISPLAY = ['Display'];
const MODEL = ['Radio model'];

const isObject = (v: unknown) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? [] : ['Must be a JSON object.'];

export const plugin = new PanelPlugin<CoverageOptions>(CoveragePanel)
  .setMigrationHandler(migrateOptions)
  .useFieldConfig({
    // Only data links make sense here: they become the click target of each AP.
    disableStandardOptions: [
      FieldConfigProperty.Unit,
      FieldConfigProperty.Min,
      FieldConfigProperty.Max,
      FieldConfigProperty.FieldMinMax,
      FieldConfigProperty.Decimals,
      FieldConfigProperty.DisplayName,
      FieldConfigProperty.NoValue,
      FieldConfigProperty.Thresholds,
      FieldConfigProperty.Mappings,
      FieldConfigProperty.Color,
      FieldConfigProperty.Actions,
    ],
  })
  .setPanelOptions((builder) =>
    builder
      .addTextInput({
        path: 'floorplanUrl',
        name: 'Floor plan URL',
        description:
          'SVG or PNG image of the floor, stretched to its size in metres. Variables allowed, for example public/floorplans/${site}-f${floor}.svg. A plan uploaded from the panel editor wins over it.',
        category: FLOOR,
        defaultValue: '',
      })
      .addTextInput({
        path: 'floor',
        name: 'Floor',
        description: 'Floor to pick in a multi-floor geometry, for example ${site}-f${floor}. Variables allowed.',
        category: FLOOR,
        defaultValue: '',
      })
      .addCustomEditor({
        id: 'geometry',
        path: 'geometry',
        name: 'Geometry',
        description:
          'Size in metres and walls, as JSON: {"size_m": [62, 24], "walls": [{"from": [0.22, 0], "to": [0.22, 1], "material": "glass"}]}. Points go from 0 to 1, origin top left. Several floors: {"floors": {"hq-f1": {...}}}.',
        category: FLOOR,
        editor: JsonOptionEditor,
        // No default value: Grafana would merge it into a saved multi-floor geometry.
        settings: { validate: validateGeometry, height: 240 },
      })
      .addCustomEditor({
        id: 'apPositions',
        path: 'apPositions',
        name: 'AP positions',
        description:
          'Positions set by dragging access points in the panel editor, by AP name, from 0 to 1. They win over the x and y labels of the data.',
        category: FLOOR,
        editor: JsonOptionEditor,
        settings: { validate: isObject, height: 120 },
        defaultValue: {},
      })
      .addCustomEditor({
        id: 'planImages',
        path: 'planImages',
        name: 'Uploaded plans',
        description: 'Plans uploaded with Floor plan in the panel editor, by floor. They are stored in the dashboard.',
        category: FLOOR,
        editor: PlanImagesEditor,
      })
      .addSelect({
        path: 'band',
        name: 'Band',
        description: 'One band at a time. Type a variable such as $band to follow the dashboard.',
        category: COVERAGE,
        defaultValue: '5GHz',
        settings: {
          allowCustomValue: true,
          options: BANDS.map((b) => ({ value: b, label: b.replace('GHz', ' GHz') })),
        },
      })
      .addRadio({
        path: 'view',
        name: 'View',
        category: COVERAGE,
        defaultValue: 'rssi',
        settings: {
          options: [
            { value: 'rssi', label: 'Signal (RSSI)' },
            { value: 'bestAp', label: 'Best AP', description: 'One colour per dominant AP, to see the cells' },
          ],
        },
      })
      .addRadio({
        path: 'colorMode',
        name: 'Colours',
        category: COVERAGE,
        defaultValue: 'gradient',
        settings: {
          options: [
            { value: 'gradient', label: 'Gradient' },
            { value: 'steps', label: 'Steps' },
          ],
        },
        showIf: (o) => o.view !== 'bestAp',
      })
      .addNumberInput({
        path: 'thresholds.good',
        name: 'Good from (dBm)',
        description: 'Voice and video.',
        category: COVERAGE,
        defaultValue: DEFAULT_THRESHOLDS.good,
        settings: { max: 0 },
      })
      .addNumberInput({
        path: 'thresholds.fair',
        name: 'Fair from (dBm)',
        description: 'Data.',
        category: COVERAGE,
        defaultValue: DEFAULT_THRESHOLDS.fair,
        settings: { max: 0 },
      })
      .addNumberInput({
        path: 'thresholds.weak',
        name: 'Weak from (dBm)',
        description: 'Connection possible.',
        category: COVERAGE,
        defaultValue: DEFAULT_THRESHOLDS.weak,
        settings: { max: 0 },
      })
      .addNumberInput({
        path: 'thresholds.floor',
        name: 'Hide below (dBm)',
        category: COVERAGE,
        defaultValue: DEFAULT_THRESHOLDS.floor,
        settings: { max: 0 },
      })
      .addSliderInput({
        path: 'heatmapOpacity',
        name: 'Map opacity',
        category: COVERAGE,
        defaultValue: 0.6,
        settings: { min: 0.1, max: 1, step: 0.05 },
      })
      .addSliderInput({
        path: 'resolutionM',
        name: 'Grid resolution (m)',
        description: 'Cell size of the computation. Smaller is finer and slower.',
        category: COVERAGE,
        defaultValue: 0.5,
        settings: { min: 0.25, max: 2, step: 0.25 },
      })
      .addBooleanSwitch({ path: 'showWalls', name: 'Show walls', category: DISPLAY, defaultValue: true })
      .addBooleanSwitch({ path: 'showApLabels', name: 'Show AP names', category: DISPLAY, defaultValue: true })
      .addBooleanSwitch({
        path: 'showRanges',
        name: 'Show AP ranges',
        description: 'Circle at the good threshold, walls ignored.',
        category: DISPLAY,
        defaultValue: false,
      })
      .addBooleanSwitch({ path: 'showLegend', name: 'Show legend', category: DISPLAY, defaultValue: true })
      .addBooleanSwitch({
        path: 'allowWhatIf',
        name: 'Allow what-if',
        description:
          'A What if button in the legend lets viewers move, add or switch off APs to compare. Nothing is saved.',
        category: DISPLAY,
        defaultValue: true,
        showIf: (o) => o.showLegend,
      })
      .addBooleanSwitch({
        path: 'allowPlanEditing',
        name: 'Allow plan editing',
        description:
          'An Edit plan button in the legend lets users who can edit dashboards move APs and draw walls in place. The panel editor always allows it.',
        category: DISPLAY,
        defaultValue: true,
        showIf: (o) => o.showLegend,
      })
      .addCustomEditor({
        id: 'materials',
        path: 'materials',
        name: 'Wall materials',
        description: `Loss in dB per wall crossed, per band. Overrides or adds to the defaults: ${JSON.stringify(DEFAULT_MATERIALS)}`,
        category: MODEL,
        editor: JsonOptionEditor,
        settings: { validate: isObject, height: 120 },
        defaultValue: {},
      })
      .addCustomEditor({
        id: 'bandModels',
        path: 'bandModels',
        name: 'Band parameters',
        description: `Frequency (MHz), path loss exponent and gains (dBi) per band. Overrides the defaults: ${JSON.stringify(DEFAULT_BAND_MODELS)}`,
        category: MODEL,
        editor: JsonOptionEditor,
        settings: { validate: isObject, height: 120 },
        defaultValue: {},
      })
  );
