import React from 'react';
import {
  Portal,
  VizTooltipContainer,
  VizTooltipContent,
  VizTooltipHeader,
  VizTooltipItem,
  VizTooltipWrapper,
} from '@grafana/ui';
import { PointSignal } from '../model/grid';
import { qualityOf } from '../render/colors';
import { AccessPoint, Band, Thresholds } from '../types';

export type Hover =
  | { kind: 'point'; xM: number; yM: number; clientX: number; clientY: number }
  | { kind: 'ap'; index: number; clientX: number; clientY: number };

const dbm = (v: number) => `${v.toFixed(0)} dBm`;

function signalRow(label: string, s: PointSignal, aps: AccessPoint[], color?: string): VizTooltipItem {
  const walls = s.walls === 0 ? '' : s.walls === 1 ? ', 1 wall' : `, ${s.walls} walls`;
  return { label, value: `${aps[s.apIndex].name} · ${dbm(s.rssiDbm)} · ${s.distanceM.toFixed(1)} m${walls}`, color };
}

export function pointItems(signals: PointSignal[], aps: AccessPoint[], t: Thresholds, apColors?: string[]) {
  const [best, second] = signals;
  if (!best || best.rssiDbm < t.floor) {
    return { header: { label: 'Predicted RSSI', value: 'No coverage' }, items: [] };
  }
  const items: VizTooltipItem[] = [
    { label: 'Quality', value: qualityOf(best.rssiDbm, t) },
    signalRow('Best AP', best, aps, apColors?.[best.apIndex]),
  ];
  if (second && second.rssiDbm >= t.floor) {
    items.push(signalRow('Second AP', second, aps, apColors?.[second.apIndex]));
  }
  return { header: { label: 'Predicted RSSI', value: dbm(best.rssiDbm) }, items };
}

export function apItems(ap: AccessPoint, band: Band) {
  const radio = ap.radios[band];
  const items: VizTooltipItem[] = [{ label: 'Status', value: ap.up ? 'Up' : 'Down' }];
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
  header: VizTooltipItem;
  items: VizTooltipItem[];
}

export const CoverageTooltip = ({ x, y, header, items }: Props) => (
  <Portal>
    <VizTooltipContainer position={{ x, y }} offset={{ x: 12, y: 12 }}>
      <VizTooltipWrapper>
        <VizTooltipHeader item={header} />
        {items.length > 0 && <VizTooltipContent items={items} />}
      </VizTooltipWrapper>
    </VizTooltipContainer>
  </Portal>
);
