import { formatBytes, heightForImage, minifySvg, svgSize } from './planImage';

describe('svgSize', () => {
  it('reads width and height', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="480">')).toEqual({
      width: 1240,
      height: 480,
    });
    expect(svgSize("<svg width='620px' height='240px' viewBox='0 0 62 24'>")).toEqual({ width: 620, height: 240 });
  });

  it('falls back on the viewBox', () => {
    expect(svgSize('<?xml version="1.0"?><svg viewBox="0 0 100 40">')).toEqual({ width: 100, height: 40 });
    expect(svgSize('<svg width="100%" height="100%" viewBox="0,0,62,24">')).toEqual({ width: 62, height: 24 });
  });

  it('gives up without a size', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg">')).toBeUndefined();
    expect(svgSize('not an svg')).toBeUndefined();
  });
});

describe('minifySvg', () => {
  it('drops comments and whitespace between tags', () => {
    expect(minifySvg('<svg>\n  <!-- walls -->\n  <line x1="0"/>\n  <text> Office 1 </text>\n</svg>\n')).toBe(
      '<svg><line x1="0"/><text> Office 1 </text></svg>'
    );
  });
});

describe('heightForImage', () => {
  it('keeps the image proportions', () => {
    expect(heightForImage(62, 1240, 480)).toBe(24);
    expect(heightForImage(100, 1000, 333)).toBe(33.3);
  });
});

describe('formatBytes', () => {
  it('rounds to a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(42_300)).toBe('42 kB');
    expect(formatBytes(1_460_000)).toBe('1.5 MB');
  });
});
