import { colorManipulator, GrafanaTheme2 } from '@grafana/data';
import { ColorMode, Thresholds } from '../types';

export type Rgb = [number, number, number];

export interface RssiScale {
  /** RGBA bytes, one entry per `step` dB from `min`. */
  lut: Uint8ClampedArray;
  min: number;
  step: number;
  size: number;
}

/** In gradient mode the colour keeps deepening this far above the good threshold. */
export const EXCELLENT_MARGIN_DB = 15;

export interface CoverageColors {
  excellent: string;
  good: string;
  fair: string;
  weak: string;
  bad: string;
}

export function coverageColors(theme: GrafanaTheme2): CoverageColors {
  const c = (name: string) => theme.visualization.getColorByName(name);
  return { excellent: c('dark-green'), good: c('green'), fair: c('yellow'), weak: c('orange'), bad: c('red') };
}

export function toRgb(color: string): Rgb {
  const { values } = colorManipulator.decomposeColor(color.startsWith('#') ? colorManipulator.hexToRgb(color) : color);
  return [values[0], values[1], values[2]];
}

const STEP_DB = 0.1;

export function qualityOf(value: number, t: Thresholds): string {
  if (value >= t.good) {
    return 'Good (voice, video)';
  }
  if (value >= t.fair) {
    return 'Fair (data)';
  }
  if (value >= t.weak) {
    return 'Weak (connection possible)';
  }
  return 'Insufficient';
}

/** One colour per AP, from the theme's classic palette. */
export function apPalette(theme: GrafanaTheme2, count: number): string[] {
  const palette = theme.visualization.palette;
  return Array.from({ length: count }, (_, i) => theme.visualization.getColorByName(palette[i % palette.length]));
}

/** Colour of an RSSI value, as `rgba()`; transparent below the floor. Used by the legend. */
export function rssiColor(value: number, scale: RssiScale): string {
  const i = Math.round((value - scale.min) / scale.step);
  if (i < 0) {
    return 'transparent';
  }
  const o = Math.min(i, scale.size - 1) * 4;
  const l = scale.lut;
  return `rgba(${l[o]}, ${l[o + 1]}, ${l[o + 2]}, ${l[o + 3] / 255})`;
}

/**
 * Lookup table from RSSI to colour. Gradient mode blends between the threshold colours,
 * steps mode paints each band flat. Above the good threshold everything is good.
 */
export function buildRssiScale(t: Thresholds, colors: CoverageColors, mode: ColorMode, opacity: number): RssiScale {
  const stops: Array<[number, Rgb]> = [
    [t.floor, toRgb(colors.bad)],
    [t.weak, toRgb(colors.weak)],
    [t.fair, toRgb(colors.fair)],
    [t.good, toRgb(colors.good)],
    ...(mode === 'gradient' ? [[t.good + EXCELLENT_MARGIN_DB, toRgb(colors.excellent)]] : []),
  ].sort((a, b) => (a[0] as number) - (b[0] as number)) as Array<[number, Rgb]>;
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  const size = Math.max(1, Math.round((max - min) / STEP_DB) + 1);
  const lut = new Uint8ClampedArray(size * 4);
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);

  for (let i = 0; i < size; i++) {
    const v = min + i * STEP_DB;
    let k = 0;
    while (k < stops.length - 2 && v >= stops[k + 1][0]) {
      k++;
    }
    const [v0, c0] = stops[k];
    const [v1, c1] = stops[k + 1];
    let rgb: Rgb;
    if (mode === 'steps') {
      rgb = v >= v1 - STEP_DB / 2 ? c1 : c0;
    } else {
      const f = v1 === v0 ? 1 : Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
      rgb = [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
    lut.set([rgb[0], rgb[1], rgb[2], alpha], i * 4);
  }
  return { lut, min, step: STEP_DB, size };
}

/** Wall colours in the layout editor, by material; other materials take palette colours. */
export function materialColor(theme: GrafanaTheme2, material: string, materials: string[]): string {
  const named: Record<string, string> = {
    glass: theme.visualization.getColorByName('blue'),
    drywall: theme.colors.text.secondary,
    brick: theme.visualization.getColorByName('orange'),
    concrete: theme.colors.text.primary,
    metal: theme.visualization.getColorByName('red'),
  };
  if (named[material]) {
    return named[material];
  }
  const palette = theme.visualization.palette;
  return theme.visualization.getColorByName(palette[Math.max(0, materials.indexOf(material)) % palette.length]);
}
