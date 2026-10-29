import React, { useEffect, useRef } from 'react';
import { CoverageGrid } from '../model/grid';
import { Rgb, RssiScale } from '../render/colors';
import { paintBestAp, paintRssi } from '../render/heatmap';
import { CoverageView } from '../types';

interface Props {
  grid?: CoverageGrid;
  width: number;
  height: number;
  view: CoverageView;
  scale: RssiScale;
  apColors: Rgb[];
  floorDbm: number;
  opacity: number;
  className?: string;
}

export const HeatmapCanvas = ({ grid, width, height, view, scale, apColors, floorDbm, opacity, className }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  useEffect(() => {
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
      paintBestAp(image, grid, apColors, floorDbm, opacity);
    } else {
      paintRssi(image, grid, scale);
    }
    ctx.putImageData(image, 0, 0);
  }, [grid, w, h, view, scale, apColors, floorDbm, opacity]);

  return <canvas ref={ref} width={w} height={h} className={className} data-testid="wifi-coverage-heatmap" />;
};
