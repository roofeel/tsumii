import { describe, expect, it } from 'vitest';
import { deltaE2000, hexToLab, hexToRgb, rgbToHex } from '../color';

describe('CIEDE2000', () => {
  // Sharma, Wu & Dalal (2005) 官方测试数据
  const cases: [number[], number[], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  it.each(cases)('%j vs %j → %f', (a, b, expected) => {
    const d = deltaE2000({ L: a[0], a: a[1], b: a[2] }, { L: b[0], a: b[1], b: b[2] });
    expect(d).toBeCloseTo(expected, 3);
  });
  it('is symmetric and zero for identical colors', () => {
    const x = hexToLab('#789477');
    const y = hexToLab('#F3DCE1');
    expect(deltaE2000(x, x)).toBe(0);
    expect(deltaE2000(x, y)).toBeCloseTo(deltaE2000(y, x), 10);
  });
});

describe('sRGB ↔ Lab', () => {
  it('white is L=100, black is L=0', () => {
    expect(hexToLab('#FFFFFF').L).toBeCloseTo(100, 2);
    expect(hexToLab('#000000').L).toBeCloseTo(0, 5);
  });
  it('hex round-trips', () => {
    expect(rgbToHex(hexToRgb('#789477'))).toBe('#789477');
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });
  it('rejects invalid hex', () => {
    expect(() => hexToRgb('#12')).toThrow();
  });
});
