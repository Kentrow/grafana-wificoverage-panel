import { createTheme } from '@grafana/data';
import { coverageColors, thresholdsInOrder } from './colors';

describe('thresholdsInOrder', () => {
  it('accepts thresholds going down from good to the floor', () => {
    expect(thresholdsInOrder({ good: -67, fair: -75, weak: -82, floor: -90 })).toBe(true);
  });
  it('refuses thresholds out of order or equal', () => {
    expect(thresholdsInOrder({ good: -75, fair: -67, weak: -82, floor: -90 })).toBe(false);
    expect(thresholdsInOrder({ good: -67, fair: -75, weak: -82, floor: -82 })).toBe(false);
  });
});

describe('coverageColors', () => {
  const light = createTheme({ colors: { mode: 'light' } });
  const dark = createTheme({ colors: { mode: 'dark' } });

  it('keeps the red to green scale by default', () => {
    expect(coverageColors(light)).toEqual(coverageColors(light, 'traffic'));
    expect(coverageColors(light).good).toBe(light.visualization.getColorByName('green'));
  });

  it('goes from light to dark blue on a light theme, and the other way on a dark one', () => {
    expect(coverageColors(light, 'blue')).toEqual({
      bad: '#6da7ec',
      weak: '#3987e5',
      fair: '#256abf',
      good: '#184f95',
      excellent: '#0d366b',
    });
    expect(coverageColors(dark, 'blue')).toEqual({
      bad: '#256abf',
      weak: '#3987e5',
      fair: '#6da7ec',
      good: '#9ec5f4',
      excellent: '#cde2fb',
    });
  });
});
