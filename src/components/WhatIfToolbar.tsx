import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, IconButton, useStyles2 } from '@grafana/ui';
import { POWER_CHANGE_DB } from '../model/layout';
import { AccessPoint, Band } from '../types';
import { EDIT_TOOLBAR_HEIGHT } from './EditToolbar';

interface Props {
  selected?: AccessPoint;
  /** The band shown, whose transmit power the toolbar gives. */
  band: Band;
  /** Transmit power change of the selected AP, in dB. */
  powerChange: number;
  onPower: (db: number) => void;
  changes: number;
  onAdd: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onReset: () => void;
  onDone: () => void;
}

/** Toolbar of the what-if mode: try changes to the APs without saving anything. */
export const WhatIfToolbar = (props: Props) => {
  const { selected, band, powerChange, onPower, changes, onAdd, onToggle, onRemove, onReset, onDone } = props;
  const styles = useStyles2(getStyles);
  const power = selected?.up ? selected.radios[band]?.txPowerDbm : undefined;
  const change = powerChange === 0 ? '' : ` (${powerChange > 0 ? '+' : ''}${powerChange} dB)`;
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
      {power !== undefined && (
        <span className={styles.power} data-testid="wifi-whatif-power">
          <IconButton
            name="minus"
            tooltip="Lower the transmit power by 1 dB"
            disabled={powerChange <= POWER_CHANGE_DB[0]}
            onClick={() => onPower(-1)}
          />
          <span>
            {power} dBm{change}
          </span>
          <IconButton
            name="plus"
            tooltip="Raise the transmit power by 1 dB"
            disabled={powerChange >= POWER_CHANGE_DB[1]}
            onClick={() => onPower(1)}
          />
        </span>
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
  power: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    whiteSpace: 'nowrap',
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
