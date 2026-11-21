import React, { useEffect, useRef } from 'react';
import { CoverageGrid } from '../model/grid';
import { ViewWindow } from '../model/view';
import { Rgb, RssiScale } from '../render/colors';
import { paintBestAp, paintRssi } from '../render/heatmap';
import { CoverageView } from '../types';

interface Props {
  grid?: CoverageGrid;
  width: number;
  height: number;
  view: CoverageView;
  /** The part of the floor shown, the whole floor by default. */
  shown?: ViewWindow;
  scale: RssiScale;
  apColors: Rgb[];
  /** Colour of the gaps between the cells of the best AP view: the panel's background. */
  gapColor?: Rgb;
  floorDbm: number;
  opacity: number;
  className?: string;
}

export const HeatmapCanvas = (props: Props) => {
  const { grid, width, height, view, shown, scale, apColors, gapColor, floorDbm, opacity, className } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  // The window as numbers, so that a new object with the same values does not repaint the map.
  const [x0, x1, y0, y1] = shown ? [shown.x0, shown.x1, shown.y0, shown.y1] : [0, 1, 0, 1];

  useEffect(() => {
    const part = { x0, x1, y0, y1 };
    const ctx = ref.current?.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, w, h);
    if (!grid) {
      return;
    }
    const image = ctx.createImageData(w, h);
    if (view === 'bestAp') {
      paintBestAp(image, grid, apColors, floorDbm, opacity, part, gapColor);
    } else {
      paintRssi(image, grid, scale, part);
    }
    ctx.putImageData(image, 0, 0);
  }, [grid, w, h, view, x0, x1, y0, y1, scale, apColors, gapColor, floorDbm, opacity]);

  return <canvas ref={ref} width={w} height={h} className={className} data-testid="wifi-coverage-heatmap" />;
};
