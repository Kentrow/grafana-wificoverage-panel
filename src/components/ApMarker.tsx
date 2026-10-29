import React from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { DataLinksContextMenu, useStyles2 } from '@grafana/ui';
import { AccessPoint } from '../types';

interface Props {
  ap: AccessPoint;
  left: number;
  top: number;
  /** Ring colour, the AP's colour in the best AP view. */
  ring?: string;
  showLabel: boolean;
  /** In the layout editor: no links, the editor handles the pointer. */
  editing?: boolean;
  selected?: boolean;
  onHover: (event: React.MouseEvent) => void;
  onLeave: () => void;
}

export const ApMarker = ({ ap, left, top, ring, showLabel, editing, selected, onHover, onLeave }: Props) => {
  const styles = useStyles2(getStyles);
  const status = ap.up ? 'up' : 'down';

  const marker = (className?: string, extra: object = {}) => (
    <div
      className={cx(styles.marker, editing && styles.editing, className)}
      style={{ left, top }}
      onMouseMove={(e) => {
        e.stopPropagation();
        onHover(e);
      }}
      onMouseLeave={onLeave}
      aria-label={`Access point ${ap.name}, ${status}`}
      data-testid={`wifi-ap-${ap.name}`}
      data-status={status}
      {...extra}
    >
      <span
        className={cx(
          styles.dot,
          ap.up ? styles.up : styles.down,
          ap.virtual && styles.virtual,
          editing && !ap.virtual && ap.positionSource === 'panel' && styles.moved,
          selected && styles.selected
        )}
        style={ring ? { outlineColor: ring } : undefined}
      >
        {!ap.up ? '×' : ap.virtual ? '+' : null}
      </span>
      {(showLabel || ap.virtual) && <span className={styles.label}>{ap.name}</span>}
    </div>
  );

  const links = editing ? [] : (ap.getLinks?.() ?? []);
  if (links.length === 0) {
    return marker();
  }
  return (
    <DataLinksContextMenu links={() => links}>
      {(api) => marker(cx(api.targetClassName, styles.clickable), api.triggerProps ?? {})}
    </DataLinksContextMenu>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  marker: css({
    position: 'absolute',
    transform: 'translate(-50%, -8px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(0.25),
    zIndex: 2,
  }),
  editing: css({
    pointerEvents: 'none',
  }),
  moved: css({
    outline: `2px dashed ${theme.colors.text.primary}`,
    outlineOffset: 2,
  }),
  selected: css({
    outline: `3px solid ${theme.colors.primary.main}`,
    outlineOffset: 2,
  }),
  clickable: css({
    cursor: 'pointer',
  }),
  dot: css({
    width: 16,
    height: 16,
    borderRadius: theme.shape.radius.circle,
    border: `2px solid ${theme.colors.background.primary}`,
    outline: '2px solid transparent',
    boxShadow: theme.shadows.z2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.error.contrastText,
    fontSize: 14,
    lineHeight: 1,
    fontWeight: theme.typography.fontWeightBold,
  }),
  up: css({
    background: theme.colors.success.main,
  }),
  virtual: css({
    background: theme.colors.primary.main,
    color: theme.colors.primary.contrastText,
    outline: `2px dashed ${theme.colors.primary.main}`,
    outlineOffset: 2,
  }),
  down: css({
    background: theme.colors.error.main,
  }),
  label: css({
    padding: theme.spacing(0, 0.5),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.primary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodySmall.fontSize,
    lineHeight: theme.typography.bodySmall.lineHeight,
    whiteSpace: 'nowrap',
    opacity: 0.9,
  }),
});
