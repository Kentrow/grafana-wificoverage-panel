import { thresholdsInOrder } from './colors';

describe('thresholdsInOrder', () => {
  it('accepts thresholds going down from good to the floor', () => {
    expect(thresholdsInOrder({ good: -67, fair: -75, weak: -82, floor: -90 })).toBe(true);
  });
  it('refuses thresholds out of order or equal', () => {
    expect(thresholdsInOrder({ good: -75, fair: -67, weak: -82, floor: -90 })).toBe(false);
    expect(thresholdsInOrder({ good: -67, fair: -75, weak: -82, floor: -82 })).toBe(false);
  });
});
