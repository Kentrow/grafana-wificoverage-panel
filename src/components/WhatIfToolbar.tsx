import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import { AccessPoint } from '../types';
import { EDIT_TOOLBAR_HEIGHT } from './EditToolbar';

interface Props {
  selected?: AccessPoint;
  changes: number;
  onAdd: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onReset: () => void;
  onDone: () => void;
}

/** Toolbar of the what-if mode: try changes to the APs without saving anything. */
export const WhatIfToolbar = ({ selected, changes, onAdd, onToggle, onRemove, onReset, onDone }: Props) => {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.toolbar} style={{ height: EDIT_TOOLBAR_HEIGHT }} data-testid="wifi-whatif-toolbar">
      <span className={styles.title}>What if</span>
      <Button size="sm" icon="plus-circle" variant="secondary" onClick={onAdd}>
        Add AP
      </Button>
      {selected?.virtual && (
        <Button size="sm" icon="trash-alt" variant="secondary" onClick={onRemove}>
          Remove {selected.name}
        </Button>
      )}
      {selected && !selected.virtual && (
        <Button size="sm" icon={selected.up ? 'toggle-off' : 'toggle-on'} variant="secondary" onClick={onToggle}>
          {selected.up ? `Switch ${selected.name} off` : `Switch ${selected.name} on`}
        </Button>
      )}
      <span className={styles.hint}>
        {selected ? 'Drag it to move it.' : 'Drag APs, add some or click one to switch it off.'} Nothing is saved.
      </span>
      <span className={styles.end}>
        {changes > 0 && (
          <Button size="sm" variant="secondary" fill="text" icon="history-alt" onClick={onReset}>
            Reset
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={onDone}>
          Done
        </Button>
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
  title: css({
    fontWeight: theme.typography.fontWeightMedium,
  }),
  hint: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  end: css({
    marginLeft: 'auto',
    display: 'flex',
    gap: theme.spacing(1),
  }),
});
