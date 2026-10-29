import React, { useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, useTheme2 } from '@grafana/ui';
import {
  clickSelection,
  isPlaced,
  MPoint,
  roomWalls,
  snapPoint,
  straighten,
  toMetres,
  toRel,
  wallAt,
} from '../model/layout';
import { AccessPoint, RelPoint, Wall } from '../types';

export type EditMode = 'aps' | 'walls' | 'rooms' | 'scale';

/** Pointer tolerances, in pixels. */
const AP_HIT_PX = 14;
const SNAP_PX = 10;
const WALL_HIT_PX = 8;
const CLICK_PX = 4;
const HANDLE_PX = 9;
const STRAIGHTEN_DEG = 4;
const MIN_WALL_M = 0.2;
const MIN_ROOM_M = 0.5;

const ARIA_LABELS: Record<EditMode, string> = {
  aps: 'Floor plan editor: drag an access point to move it',
  walls:
    'Floor plan editor: drag to draw a wall, click a wall to select it, Ctrl+click to select several, Delete to remove them',
  rooms: 'Floor plan editor: drag a rectangle to add the four walls of a room',
  scale: 'Floor plan editor: draw a line over a known length to set the scale',
};

interface Props {
  mode: EditMode;
  sizeM: [number, number];
  width: number;
  height: number;
  aps: AccessPoint[];
  walls: Wall[];
  material: string;
  selectedWalls: number[];
  selectedAp?: string;
  wallColor: (material: string) => string;
  onSelectWalls: (indices: number[]) => void;
  onSelectAp: (name: string | undefined) => void;
  /** Live position while dragging, undefined when the drag ends. */
  onDragAp: (name: string, position: RelPoint | undefined) => void;
  onMoveAp: (name: string, position: RelPoint) => void;
  onAddWalls: (walls: Wall[]) => void;
  /** Line drawn in the scale mode, in metres at the current scale. */
  measure?: [MPoint, MPoint];
  onMeasure?: (line: [MPoint, MPoint]) => void;
  onDeleteWalls: (indices: number[]) => void;
  onMoveWallEnd: (index: number, end: 'from' | 'to', position: RelPoint) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Pointer over the plan outside of a gesture, in metres; undefined when it leaves. */
  onHoverPoint?: (point: MPoint | undefined, clientX: number, clientY: number) => void;
}

type Gesture =
  | { kind: 'ap'; name: string; startPx: MPoint; moved: boolean }
  | { kind: 'wall'; from: MPoint; to: MPoint; startPx: MPoint; moved: boolean }
  | { kind: 'end'; index: number; end: 'from' | 'to'; point: MPoint; startPx: MPoint; moved: boolean };

export const LayoutEditor = (props: Props) => {
  const { mode, sizeM, width, height, aps, walls, material, selectedWalls, wallColor } = props;
  // Wall ends can be dragged when one wall alone is selected.
  const selectedWall = selectedWalls.length === 1 ? selectedWalls[0] : -1;
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const ref = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture>();
  const [hover, setHover] = useState<{ point: MPoint; snapped: boolean; overAp: boolean }>();

  const pxPerM = width / sizeM[0];
  const wallsM: Array<[MPoint, MPoint]> = walls.map((w) => [toMetres(w.from, sizeM), toMetres(w.to, sizeM)]);
  // While a wall end is dragged, show the wall where it would land.
  if (gesture?.kind === 'end' && wallsM[gesture.index]) {
    const [a, b] = wallsM[gesture.index];
    wallsM[gesture.index] = gesture.end === 'from' ? [gesture.point, b] : [a, gesture.point];
  }
  const px = ([x, y]: MPoint): MPoint => [x * pxPerM, y * pxPerM];

  const pointer = (e: React.PointerEvent): { m: MPoint; px: MPoint } => {
    const rect = ref.current!.getBoundingClientRect();
    const p: MPoint = [e.clientX - rect.left, e.clientY - rect.top];
    return { m: [p[0] / pxPerM, p[1] / pxPerM], px: p };
  };

  const apAt = (p: MPoint): string | undefined => {
    let best: string | undefined;
    let bestDistance = AP_HIT_PX;
    for (const ap of aps) {
      if (isPlaced(ap)) {
        const d = Math.hypot(ap.x * width - p[0], ap.y * height - p[1]);
        if (d <= bestDistance) {
          best = ap.name;
          bestDistance = d;
        }
      }
    }
    return best;
  };

  /** End of the wall being drawn: snapped to a wall, else straightened. */
  const wallEnd = (from: MPoint, m: MPoint, force: boolean, others = wallsM): { point: MPoint; snapped: boolean } => {
    const snap = snapPoint(m, others, SNAP_PX / pxPerM);
    return snap.snapped && !force ? snap : { point: straighten(from, m, STRAIGHTEN_DEG, force), snapped: false };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) {
      return;
    }
    const p = pointer(e);
    ref.current?.focus();
    if (mode === 'aps') {
      const name = apAt(p.px);
      props.onSelectAp(name);
      if (name) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setGesture({ kind: 'ap', name, startPx: p.px, moved: false });
      }
      return;
    }
    if (mode !== 'scale' && selectedWall >= 0 && wallsM[selectedWall]) {
      const ends = wallsM[selectedWall];
      const end = (['from', 'to'] as const).find((_, i) => {
        const [x, y] = px(ends[i]);
        return Math.hypot(x - p.px[0], y - p.px[1]) <= HANDLE_PX;
      });
      if (end) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setGesture({
          kind: 'end',
          index: selectedWall,
          end,
          point: ends[end === 'from' ? 0 : 1],
          startPx: p.px,
          moved: false,
        });
        return;
      }
    }
    const start = snapPoint(p.m, wallsM, SNAP_PX / pxPerM).point;
    e.currentTarget.setPointerCapture(e.pointerId);
    setGesture({ kind: 'wall', from: start, to: start, startPx: p.px, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointer(e);
    if (!gesture) {
      const overAp = mode === 'aps' && apAt(p.px) !== undefined;
      setHover(
        mode !== 'aps'
          ? { ...snapPoint(p.m, wallsM, SNAP_PX / pxPerM), overAp }
          : { point: p.m, snapped: false, overAp }
      );
      props.onHoverPoint?.(overAp ? undefined : p.m, e.clientX, e.clientY);
      return;
    }
    props.onHoverPoint?.(undefined, e.clientX, e.clientY);
    const moved = gesture.moved || Math.hypot(p.px[0] - gesture.startPx[0], p.px[1] - gesture.startPx[1]) > CLICK_PX;
    if (gesture.kind === 'ap') {
      if (moved) {
        props.onDragAp(gesture.name, toRel(p.m, sizeM));
      }
      setGesture({ ...gesture, moved });
      return;
    }
    if (gesture.kind === 'end') {
      const [a, b] = walls[gesture.index]
        ? [toMetres(walls[gesture.index].from, sizeM), toMetres(walls[gesture.index].to, sizeM)]
        : [p.m, p.m];
      const fixed = gesture.end === 'from' ? b : a;
      const others = wallsM.filter((_, i) => i !== gesture.index);
      const end = wallEnd(fixed, p.m, e.shiftKey, others);
      setHover({ ...end, overAp: false });
      setGesture({ ...gesture, point: end.point, moved });
      return;
    }
    // A room's corner snaps but is never straightened: the rectangle is straight already.
    const end = mode === 'rooms' ? snapPoint(p.m, wallsM, SNAP_PX / pxPerM) : wallEnd(gesture.from, p.m, e.shiftKey);
    setHover({ ...end, overAp: false });
    setGesture({ ...gesture, to: end.point, moved });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!gesture) {
      return;
    }
    const p = pointer(e);
    if (gesture.kind === 'ap') {
      props.onDragAp(gesture.name, undefined);
      if (gesture.moved) {
        props.onMoveAp(gesture.name, toRel(p.m, sizeM));
      }
    } else if (gesture.kind === 'end') {
      const other = wallsM[gesture.index]?.[gesture.end === 'from' ? 1 : 0];
      // Dropping an end onto the other one would leave a wall of no length.
      const long = other && Math.hypot(other[0] - gesture.point[0], other[1] - gesture.point[1]) >= MIN_WALL_M;
      if (gesture.moved && long) {
        props.onMoveWallEnd(gesture.index, gesture.end, toRel(gesture.point, sizeM));
      }
    } else if (!gesture.moved) {
      if (mode !== 'scale') {
        props.onSelectWalls(
          clickSelection(selectedWalls, wallAt(p.m, wallsM, WALL_HIT_PX / pxPerM), e.ctrlKey || e.metaKey)
        );
      }
    } else {
      const { from, to } = gesture;
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (mode === 'rooms') {
        if (Math.abs(to[0] - from[0]) >= MIN_ROOM_M && Math.abs(to[1] - from[1]) >= MIN_ROOM_M) {
          props.onAddWalls(roomWalls(from, to, sizeM, material));
        }
      } else if (mode === 'scale') {
        if (length >= MIN_WALL_M) {
          props.onMeasure?.([from, to]);
        }
      } else if (length >= MIN_WALL_M) {
        props.onAddWalls([{ from: toRel(from, sizeM), to: toRel(to, sizeM), material }]);
      }
    }
    setGesture(undefined);
  };

  /** Drop the gesture in progress without applying it. */
  const cancel = () => {
    if (gesture?.kind === 'ap') {
      props.onDragAp(gesture.name, undefined);
    }
    setGesture(undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const undoRedo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y');
    const remove = (e.key === 'Delete' || e.key === 'Backspace') && selectedWalls.length > 0;
    const selectAll = (e.ctrlKey || e.metaKey) && e.key === 'a' && (mode === 'walls' || mode === 'rooms');
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
      props.onSelectWalls([]);
      props.onSelectAp(undefined);
      return;
    }
    if (!undoRedo && !remove && !selectAll) {
      return;
    }
    // Grafana has keyboard shortcuts of its own: keep the ones handled here from reaching them.
    e.preventDefault();
    e.stopPropagation();
    // While dragging, the walls must not change under the gesture.
    if (gesture) {
      return;
    }
    if (undoRedo) {
      (e.key === 'y' || e.shiftKey ? props.onRedo : props.onUndo)?.();
    } else if (selectAll) {
      props.onSelectWalls(walls.map((_, i) => i));
    } else {
      props.onDeleteWalls(selectedWalls);
    }
  };

  const drawing = gesture?.kind === 'wall' && gesture.moved ? gesture : undefined;
  const cursor =
    mode !== 'aps' ? 'crosshair' : gesture?.kind === 'ap' ? 'grabbing' : hover?.overAp ? 'grab' : 'default';
  const lengthLabel = ([a, b]: [MPoint, MPoint], text: string) => (
    <text x={(px(a)[0] + px(b)[0]) / 2} y={(px(a)[1] + px(b)[1]) / 2 - 8} className={styles.length} textAnchor="middle">
      {text}
    </text>
  );
  const metres = ([a, b]: [MPoint, MPoint]) => `${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1)} m`;
  const shownMeasure =
    mode === 'scale' ? (drawing ? ([drawing.from, drawing.to] as [MPoint, MPoint]) : props.measure) : undefined;

  return (
    <svg
      ref={ref}
      className={styles.editor}
      style={{ cursor }}
      width={width}
      height={height}
      tabIndex={0}
      role="application"
      aria-label={ARIA_LABELS[mode]}
      data-testid="wifi-layout-editor"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onPointerLeave={(e) => {
        if (!gesture) {
          setHover(undefined);
        }
        props.onHoverPoint?.(undefined, e.clientX, e.clientY);
      }}
      onKeyDown={onKeyDown}
    >
      {wallsM.map(([a, b], i) => {
        const [x1, y1] = px(a);
        const [x2, y2] = px(b);
        const selected = selectedWalls.includes(i);
        return (
          <g key={i} data-testid="wifi-layout-wall">
            {selected && (
              // An outline in the background colour first, so the selection stands out from any material colour.
              <g data-testid="wifi-layout-wall-selected">
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.colors.background.primary}
                  strokeWidth={14}
                  strokeLinecap="round"
                />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.colors.primary.main}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
              </g>
            )}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={wallColor(walls[i].material)}
              strokeWidth={selected ? 4 : 3}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {drawing && mode === 'walls' && (
        <>
          <line
            x1={px(drawing.from)[0]}
            y1={px(drawing.from)[1]}
            x2={px(drawing.to)[0]}
            y2={px(drawing.to)[1]}
            stroke={wallColor(material)}
            strokeWidth={3}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
          {lengthLabel([drawing.from, drawing.to], metres([drawing.from, drawing.to]))}
        </>
      )}
      {drawing && mode === 'rooms' && (
        <>
          <rect
            x={Math.min(px(drawing.from)[0], px(drawing.to)[0])}
            y={Math.min(px(drawing.from)[1], px(drawing.to)[1])}
            width={Math.abs(px(drawing.to)[0] - px(drawing.from)[0])}
            height={Math.abs(px(drawing.to)[1] - px(drawing.from)[1])}
            fill="none"
            stroke={wallColor(material)}
            strokeWidth={3}
            strokeDasharray="6 4"
          />
          {lengthLabel(
            [drawing.from, drawing.to],
            `${Math.abs(drawing.to[0] - drawing.from[0]).toFixed(1)} × ${Math.abs(drawing.to[1] - drawing.from[1]).toFixed(1)} m`
          )}
        </>
      )}
      {shownMeasure && (
        <g data-testid="wifi-scale-line">
          <line
            x1={px(shownMeasure[0])[0]}
            y1={px(shownMeasure[0])[1]}
            x2={px(shownMeasure[1])[0]}
            y2={px(shownMeasure[1])[1]}
            stroke={theme.colors.primary.main}
            strokeWidth={3}
            strokeDasharray="8 4"
          />
          {shownMeasure.map((end, i) => (
            <circle key={i} cx={px(end)[0]} cy={px(end)[1]} r={4} fill={theme.colors.primary.main} />
          ))}
          {lengthLabel(shownMeasure, `${metres(shownMeasure)} now`)}
        </g>
      )}
      {(mode === 'walls' || mode === 'rooms') &&
        selectedWall >= 0 &&
        wallsM[selectedWall]?.map((end, i) => (
          <circle
            key={i}
            cx={px(end)[0]}
            cy={px(end)[1]}
            r={6}
            className={styles.handle}
            data-testid="wifi-layout-wall-end"
          />
        ))}
      {mode !== 'aps' && hover?.snapped && (
        <circle cx={px(hover.point)[0]} cy={px(hover.point)[1]} r={5} className={styles.snap} />
      )}
    </svg>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  editor: css({
    position: 'absolute',
    inset: 0,
    zIndex: 3,
    touchAction: 'none',
    outline: 'none',
    '&:focus-visible': {
      outline: `2px solid ${theme.colors.primary.main}`,
    },
  }),
  length: css({
    fill: theme.colors.text.primary,
    fontSize: theme.typography.bodySmall.fontSize,
    paintOrder: 'stroke',
    stroke: theme.colors.background.primary,
    strokeWidth: 3,
  }),
  handle: css({
    fill: theme.colors.background.primary,
    stroke: theme.colors.primary.main,
    strokeWidth: 2,
    cursor: 'move',
  }),
  snap: css({
    fill: 'none',
    stroke: theme.colors.primary.main,
    strokeWidth: 2,
  }),
});
