import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, Combobox, IconButton, Input, RadioButtonGroup, useStyles2 } from '@grafana/ui';
import { scaleToLength } from '../model/layout';
import { MAX_FLOOR_M, MIN_FLOOR_M } from '../model/scene';
import { AccessPoint } from '../types';
import { EditMode } from './LayoutEditor';

interface Props {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  materials: string[];
  material: string;
  onMaterialChange: (material: string) => void;
  /** Number of selected walls. */
  wallsSelected: number;
  /** The selected walls have different materials. */
  mixedMaterials: boolean;
  onDeleteWalls: () => void;
  unplaced: AccessPoint[];
  onPlace: (name: string) => void;
  selectedAp?: AccessPoint;
  /** Whether the selected AP has a position in the data to go back to. */
  selectedHasDataPosition: boolean;
  onResetAp: () => void;
  onPlan: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  sizeM: [number, number];
  /** Length of the line drawn in the scale mode, at the current scale. */
  measuredM?: number;
  onApplyScale: (realM: number) => void;
  /** Leave the in-place editing; not shown in the panel editor, which has its own Back button. */
  onDone?: () => void;
}

export const EDIT_TOOLBAR_HEIGHT = 40;

export const EditToolbar = (props: Props) => {
  const { mode, materials, material, unplaced, selectedAp, measuredM, sizeM } = props;
  const styles = useStyles2(getStyles);
  const [realM, setRealM] = useState<number>();
  const proposed = measuredM && realM && realM > 0 ? scaleToLength(sizeM, measuredM, realM) : undefined;
  const scaled = proposed?.every((v) => v >= MIN_FLOOR_M && v <= MAX_FLOOR_M) ? proposed : undefined;

  return (
    <div className={styles.toolbar} style={{ height: EDIT_TOOLBAR_HEIGHT }} data-testid="wifi-edit-toolbar">
      <RadioButtonGroup
        size="sm"
        value={mode}
        onChange={props.onModeChange}
        options={[
          { value: 'aps', label: 'Move APs', icon: 'draggabledots' },
          { value: 'walls', label: 'Draw walls', icon: 'pen' },
          {
            value: 'rooms',
            label: 'Rooms',
            icon: 'square-shape',
            description: 'Drag a rectangle to add its four walls',
          },
          { value: 'scale', label: 'Scale', icon: 'ruler-combined', description: 'Set the scale from a known length' },
        ]}
      />
      {mode === 'scale' ? (
        measuredM ? (
          <>
            <span className={styles.hint}>This line is {measuredM.toFixed(1)} m now; its real length is</span>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              width={10}
              suffix="m"
              aria-label="Real length in metres"
              value={realM ?? ''}
              onChange={(e) => setRealM(e.currentTarget.valueAsNumber)}
            />
            <Button
              size="sm"
              disabled={!scaled}
              onClick={() => {
                if (realM) {
                  props.onApplyScale(realM);
                  setRealM(undefined);
                }
              }}
            >
              Apply
            </Button>
            {proposed && (
              <span className={styles.hint}>
                {scaled
                  ? `Floor: ${sizeM[0]} × ${sizeM[1]} m → ${scaled[0]} × ${scaled[1]} m`
                  : `The floor would be ${proposed[0]} × ${proposed[1]} m: keep it between ${MIN_FLOOR_M} and ${MAX_FLOOR_M} m.`}
              </span>
            )}
          </>
        ) : (
          <span className={styles.hint}>
            Draw a line over a length you know on the plan, such as a corridor or a wall, to set the floor size.
          </span>
        )
      ) : mode === 'walls' || mode === 'rooms' ? (
        <>
          <Combobox
            aria-label="Wall material"
            width={18}
            value={props.mixedMaterials ? null : material}
            placeholder="Mixed materials"
            options={materials.map((m) => ({ value: m, label: m }))}
            onChange={(v) => props.onMaterialChange(v.value)}
          />
          {props.wallsSelected > 0 && (
            <Button size="sm" variant="destructive" fill="outline" icon="trash-alt" onClick={props.onDeleteWalls}>
              {props.wallsSelected === 1 ? 'Delete wall' : `Delete ${props.wallsSelected} walls`}
            </Button>
          )}
          <span className={styles.hint}>
            {props.wallsSelected > 1
              ? `${props.wallsSelected} walls selected: the material applies to all of them, Delete removes them. Ctrl+click adds or removes a wall.`
              : props.wallsSelected === 1
                ? 'The material applies to the selected wall. Drag its ends to move them, Ctrl+click to select more.'
                : mode === 'rooms'
                  ? 'Drag a rectangle to add the four walls of a room.'
                  : 'Drag to draw a wall, Shift to keep it straight. Click a wall to select it, Ctrl+click for several, Ctrl+A for all.'}
          </span>
        </>
      ) : (
        <>
          {unplaced.length > 0 && (
            <Combobox
              aria-label="Place an AP"
              width={28}
              placeholder={`Place an AP (${unplaced.length} unplaced)`}
              value={null}
              options={unplaced.map((ap) => ({ value: ap.name, label: ap.name }))}
              onChange={(v) => props.onPlace(v.value)}
            />
          )}
          {selectedAp?.positionSource === 'panel' && (
            <Button size="sm" variant="secondary" icon="history" onClick={props.onResetAp}>
              {props.selectedHasDataPosition ? 'Back to data position' : 'Remove from plan'}
            </Button>
          )}
          <span className={styles.hint}>Drag an AP to move it. Positions are saved in the panel options.</span>
        </>
      )}
      <span className={styles.end}>
        <IconButton name="corner-up-left" tooltip="Undo (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo} />
        <IconButton
          name="corner-up-right"
          tooltip="Redo (Ctrl+Shift+Z)"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        />
        <Button size="sm" variant="secondary" icon="cloud-upload" onClick={props.onPlan}>
          Floor plan
        </Button>
        {props.onDone && (
          <Button
            size="sm"
            variant="primary"
            onClick={props.onDone}
            tooltip="Changes are kept in the dashboard: save it to keep them."
          >
            Done
          </Button>
        )}
      </span>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  toolbar: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flex: 'none',
    overflow: 'hidden',
  }),
  end: css({
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flex: 'none',
  }),
  hint: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
});
