import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { CoreApp, GrafanaTheme2, PanelProps } from '@grafana/data';
import { config, hasPermission, PanelDataErrorView } from '@grafana/runtime';
import { Button, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { joinFrames, parseBand } from '../data/frames';
import { signalsAt } from '../model/grid';
import {
  addWalls,
  applyWhatIf,
  floorKey,
  isPlaced,
  MPoint,
  moveWallEnd,
  placeAps,
  removeWalls,
  scaleToLength,
  setWallsMaterial,
  commonMaterial,
  updateFloor,
  whatIfAp,
} from '../model/layout';
import { rangeForRssi, resolveBandModel, resolveMaterials } from '../model/propagation';
import { buildScene, resolveFloor } from '../model/scene';
import { apPalette, buildRssiScale, coverageColors, materialColor, toRgb } from '../render/colors';
import { CoverageOptions, FloorGeometry, RelPoint, Thresholds, WhatIf } from '../types';
import { resolvePlanUrl } from '../utils/planUrl';
import { useCoverageGrid } from '../worker/useCoverageGrid';
import { ApMarker } from './ApMarker';
import { apItems, CoverageTooltip, Hover, pointItems } from './CoverageTooltip';
import { EDIT_TOOLBAR_HEIGHT, EditToolbar } from './EditToolbar';
import { HeatmapCanvas } from './HeatmapCanvas';
import { EditMode, LayoutEditor } from './LayoutEditor';
import { Legend } from './Legend';
import { PlanChange, PlanDialog } from './PlanDialog';
import { WhatIfToolbar } from './WhatIfToolbar';

interface Props extends PanelProps<CoverageOptions> {}

export const DEFAULT_THRESHOLDS: Thresholds = { good: -67, fair: -75, weak: -82, floor: -90 };

const LEGEND_HEIGHT = 32;
const HISTORY_LENGTH = 50;

/** What the layout editor changes, for undo and redo. */
type Snapshot = Pick<CoverageOptions, 'geometry' | 'apPositions' | 'planImages'>;

const EMPTY_WHAT_IF: WhatIf = { moved: {}, switched: [], added: [] };

export const CoveragePanel = (props: Props) => {
  const { options, data, width, height, fieldConfig, id, replaceVariables, onOptionsChange } = props;
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [hover, setHover] = useState<Hover>();
  const [planFailed, setPlanFailed] = useState<string>();

  // The layout can be edited in the panel editor only, like the Canvas panel.
  // Grafana 13 also edits dashboards outside the panel editor: like the Canvas panel, the plan can
  // then be edited in place, from the Edit plan button, by users who may edit dashboards.
  const inPanelEditor = usePanelContext().app === CoreApp.PanelEditor;
  const [editingInPlace, setEditingInPlace] = useState(false);
  const editing = inPanelEditor || editingInPlace;
  const canEditPlan = options.allowPlanEditing !== false && hasPermission('dashboards:write');
  const [editMode, setEditMode] = useState<EditMode>('aps');
  const [material, setMaterial] = useState('drywall');
  const [selectedWalls, setSelectedWalls] = useState<number[]>([]);
  const [selectedAp, setSelectedAp] = useState<string>();
  const [drag, setDrag] = useState<{ name: string; position: RelPoint }>();
  const [history, setHistory] = useState<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const [planDialog, setPlanDialog] = useState(false);
  const [measure, setMeasure] = useState<[MPoint, MPoint]>();
  // What-if mode, outside the editor: changes to try, never saved.
  const [whatIf, setWhatIf] = useState<WhatIf>();
  const trying = !editing && whatIf !== undefined;

  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const resolutionM = Math.min(2, Math.max(0.25, options.resolutionM || 0.5));
  const floorName = replaceVariables(options.floor ?? '');
  const bandText = replaceVariables(options.band || '5GHz');
  const band = parseBand(bandText);

  // Another floor (a dashboard variable changed): what was selected or tried belongs to the old one.
  const shownFloor = `${floorName}\n${replaceVariables(options.floorplanUrl ?? '')}`;
  const [lastFloor, setLastFloor] = useState(shownFloor);
  if (shownFloor !== lastFloor) {
    setLastFloor(shownFloor);
    setWhatIf(undefined);
    setSelectedAp(undefined);
    setSelectedWalls([]);
    setMeasure(undefined);
  }

  const joined = useMemo(() => joinFrames(data.series), [data.series]);
  const aps = useMemo(() => {
    const list = applyWhatIf(placeAps(joined.aps, options.apPositions), trying ? whatIf : undefined);
    return drag
      ? list.map((ap) => (ap.name === drag.name ? { ...ap, x: drag.position[0], y: drag.position[1] } : ap))
      : list;
  }, [joined.aps, options.apPositions, whatIf, trying, drag]);
  const floor = useMemo(() => resolveFloor(options.geometry, floorName), [options.geometry, floorName]);
  const model = useMemo(
    () => (band ? resolveBandModel(band, options.bandModels) : undefined),
    [band, options.bandModels]
  );
  const materials = useMemo(() => resolveMaterials(options.materials), [options.materials]);
  const scene = useMemo(
    () =>
      typeof floor === 'object' && band && model
        ? buildScene(aps, floor, band, model, materials, resolutionM)
        : undefined,
    [aps, floor, band, model, materials, resolutionM]
  );
  const result = useCoverageGrid(scene?.input);

  const colors = useMemo(() => coverageColors(theme), [theme]);
  const scale = useMemo(
    () => buildRssiScale(thresholds, colors, options.colorMode ?? 'gradient', options.heatmapOpacity ?? 0.6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      thresholds.good,
      thresholds.fair,
      thresholds.weak,
      thresholds.floor,
      colors,
      options.colorMode,
      options.heatmapOpacity,
    ]
  );
  const apColors = useMemo(() => apPalette(theme, aps.length), [theme, aps.length]);
  const apRgb = useMemo(() => apColors.map(toRgb), [apColors]);

  // In the editor the plan stays editable without data: the plan and walls usually come first.
  if (data.series.length === 0 && !editing) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} />;
  }
  if (typeof floor === 'string') {
    throw new Error(floor);
  }
  if (!band || !model || !scene) {
    throw new Error(`Unknown band "${bandText}". Use 2.4GHz, 5GHz or 6GHz.`);
  }
  if (aps.length === 0 && !editing) {
    throw new Error(
      'No access point in the data. The panel needs series with an ap label, ideally from a metric whose name ends in ap_info, such as aruba_ap_info.'
    );
  }

  const [widthM, heightM] = floor.size_m;
  const unplaced = aps.filter((ap) => !isPlaced(ap));
  const toolbar = editing || trying;
  const areaHeight = Math.max(
    1,
    height - (options.showLegend ? LEGEND_HEIGHT : 0) - (toolbar ? EDIT_TOOLBAR_HEIGHT : 0)
  );
  const pxPerM = Math.min(width / widthM, areaHeight / heightM);
  const stageW = widthM * pxPerM;
  const stageH = heightM * pxPerM;
  const planKey = floorKey(options.geometry, floorName);
  const uploadedPlan = planKey !== undefined ? options.planImages?.[planKey] : undefined;
  const planUrl =
    uploadedPlan ?? resolvePlanUrl(replaceVariables(floor.plan ?? options.floorplanUrl ?? ''), config.appSubUrl ?? '');

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({
      kind: 'point',
      xM: ((e.clientX - rect.left) / rect.width) * widthM,
      yM: ((e.clientY - rect.top) / rect.height) * heightM,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  // Layout edits go through the history, so they can be undone.
  const snapshot = (): Snapshot => ({
    geometry: options.geometry,
    apPositions: options.apPositions,
    planImages: options.planImages,
  });
  const commit = (next: Partial<Snapshot>) => {
    setHistory((h) => ({ past: [...h.past.slice(1 - HISTORY_LENGTH), snapshot()], future: [] }));
    onOptionsChange({ ...options, ...next });
  };
  const undo = () => {
    const previous = history.past[history.past.length - 1];
    if (previous) {
      setHistory({ past: history.past.slice(0, -1), future: [snapshot(), ...history.future] });
      // Walls are selected by index, which may now point to another wall.
      setSelectedWalls([]);
      onOptionsChange({ ...options, ...previous });
    }
  };
  const redo = () => {
    const [next, ...future] = history.future;
    if (next) {
      setHistory({ past: [...history.past, snapshot()], future });
      setSelectedWalls([]);
      onOptionsChange({ ...options, ...next });
    }
  };
  const setPositions = (positions: Record<string, RelPoint>) => commit({ apPositions: positions });
  const editFloor = (update: (f: FloorGeometry) => FloorGeometry) =>
    commit({ geometry: updateFloor(options.geometry, floorName, update) });

  const materialNames = Object.keys(materials);
  const wallColor = (m: string) => materialColor(theme, m, materialNames);
  const selected = aps.find((ap) => ap.name === selectedAp);
  const dataAp = joined.aps.find((ap) => ap.name === selectedAp);

  const placeAp = (name: string) => {
    // Drop new APs near the centre, a little apart so they don't hide each other.
    const n = Object.keys(options.apPositions ?? {}).length % 8;
    setPositions({ ...options.apPositions, [name]: [0.5 + 0.03 * (n % 4), 0.5 + 0.05 * Math.floor(n / 4)] });
    setSelectedAp(name);
  };
  const resetAp = () => {
    if (selectedAp) {
      const { [selectedAp]: _removed, ...rest } = options.apPositions ?? {};
      setPositions(rest);
    }
  };
  const selectWalls = (indices: number[]) => {
    setSelectedWalls(indices);
    const shared = commonMaterial(floor.walls ?? [], indices);
    if (shared) {
      setMaterial(shared);
    }
  };
  const changeMaterial = (m: string) => {
    setMaterial(m);
    if (selectedWalls.length > 0) {
      editFloor((f) => setWallsMaterial(f, selectedWalls, m));
    }
  };
  const deleteWalls = (indices: number[]) => {
    editFloor((f) => removeWalls(f, indices));
    setSelectedWalls([]);
  };
  const applyPlan = ({ image, sizeM }: PlanChange) => {
    const planImages = { ...options.planImages };
    if (planKey !== undefined && image === null) {
      delete planImages[planKey];
    } else if (planKey !== undefined && image) {
      planImages[planKey] = image.url;
    }
    commit({ planImages, geometry: updateFloor(options.geometry, floorName, (f) => ({ ...f, size_m: sizeM })) });
    setPlanDialog(false);
  };

  // What-if changes.
  const scenario = whatIf ?? EMPTY_WHAT_IF;
  const whatIfChanges = Object.keys(scenario.moved).length + scenario.switched.length + scenario.added.length;
  const moveInScenario = (name: string, position: RelPoint) => {
    const added = scenario.added.map((ap) => (ap.name === name ? { ...ap, x: position[0], y: position[1] } : ap));
    const isAdded = scenario.added.some((ap) => ap.name === name);
    setWhatIf({ ...scenario, added, moved: isAdded ? scenario.moved : { ...scenario.moved, [name]: position } });
  };
  const addInScenario = () => {
    const n = scenario.added.length % 6;
    const ap = whatIfAp(joined.aps, scenario.added, [0.45 + 0.05 * (n % 3), 0.45 + 0.1 * Math.floor(n / 3)]);
    setWhatIf({ ...scenario, added: [...scenario.added, ap] });
    setSelectedAp(ap.name);
  };
  const toggleInScenario = () => {
    if (selectedAp) {
      const switched = scenario.switched.includes(selectedAp)
        ? scenario.switched.filter((n) => n !== selectedAp)
        : [...scenario.switched, selectedAp];
      setWhatIf({ ...scenario, switched });
    }
  };
  const removeFromScenario = () => {
    setWhatIf({ ...scenario, added: scenario.added.filter((ap) => ap.name !== selectedAp) });
    setSelectedAp(undefined);
  };

  let tooltip: React.ReactNode = null;
  if (editing) {
    tooltip = null;
  } else if (hover?.kind === 'point') {
    const { header, items } = pointItems(
      signalsAt(scene.input, hover.xM, hover.yM),
      aps,
      thresholds,
      options.view === 'bestAp' ? apColors : undefined
    );
    tooltip = <CoverageTooltip x={hover.clientX} y={hover.clientY} header={header} items={items} />;
  } else if (hover?.kind === 'ap' && aps[hover.index]) {
    const { header, items } = apItems(aps[hover.index], band);
    tooltip = <CoverageTooltip x={hover.clientX} y={hover.clientY} header={header} items={items} />;
  }

  const warnings: string[] = [];
  if (scene.unknownMaterials.length > 0) {
    warnings.push(`Unknown wall materials counted as 0 dB: ${scene.unknownMaterials.join(', ')}.`);
  }
  if (unplaced.length > 0) {
    warnings.push(
      `${unplaced.length} access point${unplaced.length > 1 ? 's have' : ' has'} no position: ` +
        'edit the panel to place them, or add x and y labels to the ap_info series.'
    );
  }
  if (planUrl && planFailed === planUrl) {
    warnings.push(
      uploadedPlan
        ? 'The uploaded floor plan could not be displayed.'
        : `The floor plan could not be loaded from ${planUrl}.`
    );
  }
  const grid = result?.grid;
  const details =
    'Log-distance estimate with wall losses. Reflections, other floors and people are ignored.' +
    (grid && result
      ? ` Grid ${grid.cols} × ${grid.rows} at ${grid.resolutionM} m, computed in ${result.elapsedMs.toFixed(0)} ms` +
        (result.inWorker ? ' in a web worker.' : ' on the main thread.')
      : '');

  const endWhatIf = () => {
    setWhatIf(undefined);
    setSelectedAp(undefined);
    setHover(undefined);
  };

  return (
    <div className={styles.wrapper} style={{ width, height }}>
      {editing && (
        <EditToolbar
          mode={editMode}
          onModeChange={(m) => {
            setEditMode(m);
            setMeasure(undefined);
            setSelectedWalls([]);
            setSelectedAp(undefined);
          }}
          materials={materialNames}
          material={material}
          onMaterialChange={changeMaterial}
          wallsSelected={selectedWalls.length}
          mixedMaterials={selectedWalls.length > 1 && !commonMaterial(floor.walls ?? [], selectedWalls)}
          onDeleteWalls={() => deleteWalls(selectedWalls)}
          unplaced={unplaced}
          onPlace={placeAp}
          selectedAp={selected}
          selectedHasDataPosition={dataAp !== undefined && isPlaced(dataAp)}
          onResetAp={resetAp}
          onPlan={() => setPlanDialog(true)}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={undo}
          onRedo={redo}
          onDone={
            inPanelEditor
              ? undefined
              : () => {
                  setEditingInPlace(false);
                  setSelectedWalls([]);
                  setSelectedAp(undefined);
                  setMeasure(undefined);
                }
          }
          sizeM={floor.size_m}
          measuredM={measure && Math.hypot(measure[1][0] - measure[0][0], measure[1][1] - measure[0][1])}
          onApplyScale={(realM) => {
            if (measure) {
              const measuredM = Math.hypot(measure[1][0] - measure[0][0], measure[1][1] - measure[0][1]);
              editFloor((f) => ({ ...f, size_m: scaleToLength(f.size_m, measuredM, realM) }));
              setMeasure(undefined);
            }
          }}
        />
      )}
      {trying && (
        <WhatIfToolbar
          selected={selected}
          changes={whatIfChanges}
          onAdd={addInScenario}
          onToggle={toggleInScenario}
          onRemove={removeFromScenario}
          onReset={() => setWhatIf(EMPTY_WHAT_IF)}
          onDone={endWhatIf}
        />
      )}
      <div className={styles.area} style={{ height: areaHeight }}>
        <div
          className={styles.stage}
          style={{ width: stageW, height: stageH }}
          onMouseMove={onStageMove}
          onMouseLeave={() => setHover(undefined)}
          data-testid="wifi-coverage-stage"
        >
          {planUrl && (
            <img
              src={planUrl}
              alt="Floor plan"
              className={styles.layer}
              onError={() => setPlanFailed(planUrl)}
              onLoad={() => setPlanFailed(undefined)}
              data-testid="wifi-floor-plan"
            />
          )}
          <HeatmapCanvas
            className={styles.layer}
            grid={grid}
            width={stageW}
            height={stageH}
            view={options.view ?? 'rssi'}
            scale={scale}
            apColors={apRgb}
            floorDbm={thresholds.floor}
            opacity={options.heatmapOpacity ?? 0.6}
          />
          <svg className={styles.layer} viewBox={`0 0 ${widthM} ${heightM}`} preserveAspectRatio="none">
            {options.showWalls &&
              !editing &&
              scene.input.walls.map((w, i) => (
                <line
                  key={i}
                  x1={w.x1}
                  y1={w.y1}
                  x2={w.x2}
                  y2={w.y2}
                  stroke={theme.colors.text.primary}
                  strokeOpacity={0.8}
                  strokeWidth={1.5 + w.lossDb / 8}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                />
              ))}
            {options.showRanges &&
              scene.input.aps.map((ap) => (
                <circle
                  key={ap.index}
                  cx={ap.xM}
                  cy={ap.yM}
                  r={rangeForRssi(ap.txPowerDbm, model, thresholds.good)}
                  fill="none"
                  stroke={apColors[ap.index]}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                  data-testid="wifi-ap-range"
                />
              ))}
          </svg>
          {aps.map(
            (ap, index) =>
              isPlaced(ap) && (
                <ApMarker
                  key={ap.name}
                  ap={ap}
                  left={ap.x * stageW}
                  top={ap.y * stageH}
                  ring={options.view === 'bestAp' && !toolbar ? apColors[index] : undefined}
                  showLabel={options.showApLabels || editing}
                  editing={toolbar}
                  selected={toolbar && ap.name === selectedAp}
                  onHover={(e) => setHover({ kind: 'ap', index, clientX: e.clientX, clientY: e.clientY })}
                  onLeave={() => setHover(undefined)}
                />
              )
          )}
          {editing && (
            <LayoutEditor
              mode={editMode}
              sizeM={floor.size_m}
              width={stageW}
              height={stageH}
              aps={aps}
              walls={floor.walls ?? []}
              material={material}
              selectedWalls={selectedWalls}
              selectedAp={selectedAp}
              wallColor={wallColor}
              onSelectWalls={selectWalls}
              onSelectAp={setSelectedAp}
              onDragAp={(name, position) => setDrag(position ? { name, position } : undefined)}
              onMoveAp={(name, position) => setPositions({ ...options.apPositions, [name]: position })}
              onAddWalls={(walls) => editFloor((f) => addWalls(f, walls))}
              measure={measure}
              onMeasure={setMeasure}
              onDeleteWalls={deleteWalls}
              onMoveWallEnd={(index, end, position) => editFloor((f) => moveWallEnd(f, index, end, position))}
              onUndo={undo}
              onRedo={redo}
            />
          )}
          {trying && (
            <LayoutEditor
              mode="aps"
              sizeM={floor.size_m}
              width={stageW}
              height={stageH}
              aps={aps}
              walls={[]}
              material=""
              selectedWalls={[]}
              selectedAp={selectedAp}
              wallColor={wallColor}
              onSelectWalls={() => undefined}
              onSelectAp={setSelectedAp}
              onDragAp={(name, position) => setDrag(position ? { name, position } : undefined)}
              onMoveAp={moveInScenario}
              onAddWalls={() => undefined}
              onDeleteWalls={() => undefined}
              onMoveWallEnd={() => undefined}
              onHoverPoint={(point, clientX, clientY) =>
                setHover(point ? { kind: 'point', xM: point[0], yM: point[1], clientX, clientY } : undefined)
              }
            />
          )}
          {!editing && unplaced.length === aps.length && (
            <div className={styles.notice}>
              No access point has a position yet. Edit the panel to place them on the plan.
            </div>
          )}
          {editing && aps.length === 0 && (
            <div className={styles.notice} data-testid="wifi-no-ap-notice">
              No access point in the data yet: add a query whose series have an ap label, ideally a metric whose name
              ends in ap_info. Meanwhile, upload the floor plan and draw the walls.
            </div>
          )}
        </div>
      </div>
      {options.showLegend && (
        <Legend
          band={band}
          view={options.view ?? 'rssi'}
          thresholds={thresholds}
          colorMode={options.colorMode ?? 'gradient'}
          colors={colors}
          aps={aps}
          apColors={apColors}
          transmitting={scene.input.aps.length}
          details={details}
          warnings={warnings}
          actions={
            !editing &&
            !trying && (
              <>
                {canEditPlan && (
                  <Button
                    size="sm"
                    variant="secondary"
                    fill="text"
                    icon="pen"
                    onClick={() => setEditingInPlace(true)}
                    tooltip="Move APs, draw walls and set the floor plan. Save the dashboard to keep the changes."
                  >
                    Edit plan
                  </Button>
                )}
                {options.allowWhatIf !== false && (
                  <Button
                    size="sm"
                    variant="secondary"
                    fill="text"
                    icon="lightbulb-alt"
                    onClick={() => setWhatIf(EMPTY_WHAT_IF)}
                    tooltip="Try moving, adding or switching APs on and off. Nothing is saved."
                  >
                    What if
                  </Button>
                )}
              </>
            )
          }
        />
      )}
      {planDialog && (
        <PlanDialog
          sizeM={floor.size_m}
          hasUploadedPlan={uploadedPlan !== undefined}
          onApply={applyPlan}
          onDismiss={() => setPlanDialog(false)}
        />
      )}
      {tooltip}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }),
  area: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  stage: css({
    position: 'relative',
    flex: 'none',
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
  }),
  notice: css({
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(2),
    textAlign: 'center',
    color: theme.colors.text.secondary,
  }),
  layer: css({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  }),
});
