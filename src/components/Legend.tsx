import React, { ReactNode } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { CoverageColors, EXCELLENT_MARGIN_DB } from '../render/colors';
import { AccessPoint, Band, ColorMode, CoverageView, Thresholds } from '../types';

interface Props {
  band: Band;
  view: CoverageView;
  thresholds: Thresholds;
  colorMode: ColorMode;
  colors: CoverageColors;
  aps: AccessPoint[];
  apColors: string[];
  transmitting: number;
  details: string;
  warnings: string[];
  /** Buttons at the end of the legend. */
  actions?: ReactNode;
}

export const Legend = (props: Props) => {
  const { band, view, thresholds: t, colorMode, colors, aps, apColors, transmitting, details, warnings } = props;
  const styles = useStyles2(getStyles);
  const down = aps.filter((ap) => !ap.up).length;
  const steps: Array<[string, string, string]> = [
    [colors.good, `≥ ${t.good}`, 'Good'],
    [colors.fair, `${t.fair}`, 'Fair'],
    [colors.weak, `${t.weak}`, 'Weak'],
    [colors.bad, `${t.floor}`, 'Insufficient'],
  ];

  return (
    <div className={styles.legend} data-testid="wifi-coverage-legend">
      <Tooltip content={details} placement="top">
        <span className={styles.title}>
          Predicted coverage · {band.replace('GHz', ' GHz')}
          <Icon name="info-circle" size="sm" />
        </span>
      </Tooltip>

      {view === 'rssi' ? (
        <span className={styles.scale}>
          {colorMode === 'gradient' ? (
            <>
              <span>{t.floor} dBm</span>
              <span
                className={styles.bar}
                style={{
                  background: `linear-gradient(to right, ${colors.bad}, ${colors.weak}, ${colors.fair}, ${colors.good}, ${colors.excellent})`,
                }}
              />
              <span>{t.good + EXCELLENT_MARGIN_DB} dBm</span>
            </>
          ) : (
            steps
              .slice()
              .reverse()
              .map(([color, value, label]) => (
                <span key={label} className={styles.item} title={label}>
                  <span className={styles.swatch} style={{ background: color }} />
                  {value}
                </span>
              ))
          )}
        </span>
      ) : (
        <span className={styles.scale}>
          {aps.map((ap, i) => (
            <span key={ap.name} className={styles.item}>
              <span className={styles.swatch} style={{ background: apColors[i] }} />
              {ap.name}
            </span>
          ))}
        </span>
      )}

      <span className={styles.status}>
        {transmitting}/{aps.length} APs on this band{down > 0 && <span className={styles.down}> · {down} down</span>}
        {warnings.length > 0 && (
          <Tooltip content={warnings.join(' ')}>
            <Icon name="exclamation-triangle" className={styles.warning} />
          </Tooltip>
        )}
        {props.actions}
      </span>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  legend: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    flexWrap: 'nowrap',
    overflow: 'hidden',
    height: theme.spacing(4),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    whiteSpace: 'nowrap',
  }),
  title: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.colors.text.primary,
  }),
  scale: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    overflow: 'hidden',
  }),
  bar: css({
    display: 'inline-block',
    width: 120,
    height: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
  }),
  item: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  }),
  swatch: css({
    display: 'inline-block',
    width: theme.spacing(1.5),
    height: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
  }),
  status: css({
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  }),
  down: css({
    color: theme.colors.error.text,
  }),
  warning: css({
    color: theme.colors.warning.text,
  }),
});
