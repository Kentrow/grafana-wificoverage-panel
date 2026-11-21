import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Portal, useStyles2, VizTooltipContainer } from '@grafana/ui';
import { PointSignal } from '../model/grid';
import { qualityOf } from '../render/colors';
import { AccessPoint, Band, Thresholds } from '../types';

/** A line of the tooltip. TooltipItem and its components only exist from Grafana 13.1. */
export interface TooltipItem {
  label: string;
  value: string;
  color?: string;
}

export type Hover =
  | { kind: 'point'; xM: number; yM: number; clientX: number; clientY: number }
  | { kind: 'ap'; index: number; clientX: number; clientY: number };

const dbm = (v: number) => `${v.toFixed(0)} dBm`;

function signalRow(label: string, s: PointSignal, aps: AccessPoint[], color?: string): TooltipItem {
  const walls = s.walls === 0 ? '' : s.walls === 1 ? ', 1 wall' : `, ${s.walls} walls`;
  return { label, value: `${aps[s.apIndex].name} · ${dbm(s.rssiDbm)} · ${s.distanceM.toFixed(1)} m${walls}`, color };
}

/** What the channel views add to the tooltip of a point: the channel, and the APs heard on it. */
export interface ChannelHover {
  band: Band;
  thresholdDbm: number;
  span: number;
}

export function pointItems(
  signals: PointSignal[],
  aps: AccessPoint[],
  t: Thresholds,
  apColors?: string[],
  channel?: ChannelHover
) {
  const [best, second] = signals;
  if (!best || best.rssiDbm < t.floor) {
    return { header: { label: 'Predicted RSSI', value: 'No coverage' }, items: [] };
  }
  const items: TooltipItem[] = [
    { label: 'Quality', value: qualityOf(best.rssiDbm, t) },
    signalRow('Best AP', best, aps, apColors?.[best.apIndex]),
  ];
  if (second && second.rssiDbm >= t.floor) {
    items.push(signalRow('Second AP', second, aps, apColors?.[second.apIndex]));
  }
  const bestChannel = channel && aps[best.apIndex].radios[channel.band]?.channel;
  if (channel && bestChannel !== undefined) {
    const heard = signals.slice(1).filter((s) => {
      const c = aps[s.apIndex].radios[channel.band]?.channel;
      return s.rssiDbm >= channel.thresholdDbm && c !== undefined && Math.abs(c - bestChannel) <= channel.span;
    });
    items.push({ label: 'Channel', value: String(bestChannel) });
    items.push({
      label: 'Same channel',
      value: heard.length ? heard.map((s) => `${aps[s.apIndex].name} · ${dbm(s.rssiDbm)}`).join(', ') : 'none',
    });
  }
  return { header: { label: 'Predicted RSSI', value: dbm(best.rssiDbm) }, items };
}

export function apItems(ap: AccessPoint, band: Band) {
  const radio = ap.radios[band];
  const items: TooltipItem[] = [{ label: 'Status', value: ap.up ? 'Up' : 'Down' }];
  if (ap.model) {
    items.push({ label: 'Model', value: ap.model });
  }
  if (!radio) {
    items.push({ label: band, value: 'No radio on this band' });
  } else {
    if (radio.txPowerDbm !== undefined) {
      items.push({ label: 'Tx power', value: `${radio.txPowerDbm} dBm` });
    }
    if (radio.channel !== undefined) {
      items.push({ label: 'Channel', value: String(radio.channel) });
    }
    if (radio.clients !== undefined) {
      items.push({ label: 'Clients', value: String(radio.clients) });
    }
    if (radio.noiseFloorDbm !== undefined) {
      items.push({ label: 'Noise floor', value: `${radio.noiseFloorDbm} dBm` });
    }
  }
  return { header: { label: 'Access point', value: ap.name }, items };
}

interface Props {
  x: number;
  y: number;
  header: TooltipItem;
  items: TooltipItem[];
}

export const CoverageTooltip = ({ x, y, header, items }: Props) => {
  const styles = useStyles2(getStyles);
  return (
    <Portal>
      <VizTooltipContainer position={{ x, y }} offset={{ x: 12, y: 12 }}>
        <div className={styles.tooltip} data-testid="wifi-coverage-tooltip">
          <div className={styles.header}>
            <span className={styles.label}>{header.label}</span>
            <span className={styles.value}>{header.value}</span>
          </div>
          {items.map((item) => (
            <div key={item.label} className={styles.row}>
              {item.color && <span className={styles.swatch} style={{ background: item.color }} />}
              <span className={styles.label}>{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </VizTooltipContainer>
    </Portal>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  tooltip: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  header: css({
    display: 'flex',
    gap: theme.spacing(1),
    paddingBottom: theme.spacing(0.5),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  row: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  }),
  label: css({
    color: theme.colors.text.secondary,
  }),
  value: css({
    fontWeight: theme.typography.fontWeightMedium,
  }),
  swatch: css({
    width: theme.spacing(1.5),
    height: theme.spacing(0.5),
    borderRadius: theme.shape.radius.default,
  }),
});
