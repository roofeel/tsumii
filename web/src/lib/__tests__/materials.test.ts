import { describe, expect, it } from 'vitest';
import type { BeadColor } from '../types';
import { beadsPerPackage, calculateMaterials, estimateAccessories, mergeShoppingLists, reserveFor } from '../materials';

const color = (id: string, extra: Partial<BeadColor> = {}): BeadColor => ({
  id, brand: 'MIYUKI', series: 'Delica', size: '11/0', code: `T-${id}`, name: id, nameZh: id, hex: '#808080',
  finish: 'opaque', discontinued: false, packBeads: 100, verified: false, ...extra,
});
const catalog = new Map<string, BeadColor>([
  ['a', color('a')],
  ['b', color('b', { packBeads: undefined, gramsPerPack: 5, beadsPerGram: 20 })],
  ['c', color('c', { packBeads: undefined })],
  ['d', color('d', { discontinued: true })],
]);

describe('reserveFor', () => {
  it('rounds up and avoids floating point drift', () => {
    expect(reserveFor(30, 0.1)).toBe(3);
    expect(reserveFor(31, 0.1)).toBe(4);
    expect(reserveFor(1, 0.1)).toBe(1);
    expect(reserveFor(0, 0.1)).toBe(0);
    expect(reserveFor(70, 0.1)).toBe(7);
  });
});

describe('beadsPerPackage', () => {
  it('prefers packBeads, otherwise converts grams', () => {
    expect(beadsPerPackage(catalog.get('a')!)).toBe(100);
    expect(beadsPerPackage(catalog.get('b')!)).toBe(100);
    expect(beadsPerPackage(catalog.get('c')!)).toBeNull();
  });
});

describe('calculateMaterials', () => {
  it('follows Required / Reserve / Purchase / Packages formulas', () => {
    const cells = [...Array(95).fill('a'), ...Array(30).fill('b')];
    const s = calculateMaterials({ cells }, catalog, { wastageRate: 0.1 });
    expect(s.totalBeads).toBe(125);
    expect(s.colorCount).toBe(2);
    const a = s.lines.find((l) => l.colorId === 'a')!;
    expect(a).toMatchObject({ required: 95, reserve: 10, purchaseNeeded: 105, packages: 2 });
    const b = s.lines.find((l) => l.colorId === 'b')!;
    expect(b).toMatchObject({ required: 30, reserve: 3, purchaseNeeded: 33, packages: 1 });
    expect(s.totalPackages).toBe(3);
    expect(s.needsConfirmation).toEqual([]);
  });

  it('sums of required always equal pattern bead count', () => {
    const ids = ['a', 'b', 'c'];
    const cells = Array.from({ length: 480 }, (_, i) => ids[(i * 7) % 3]);
    const s = calculateMaterials({ cells }, catalog);
    expect(s.lines.reduce((n, l) => n + l.required, 0)).toBe(480);
  });

  it('updates immediately when one bead changes', () => {
    const cells = Array(50).fill('a');
    const before = calculateMaterials({ cells }, catalog);
    const after = calculateMaterials({ cells: ['b', ...cells.slice(1)] }, catalog);
    expect(before.lines.find((l) => l.colorId === 'a')!.required).toBe(50);
    expect(after.lines.find((l) => l.colorId === 'a')!.required).toBe(49);
    expect(after.lines.find((l) => l.colorId === 'b')!.required).toBe(1);
  });

  it('flags missing packaging data and discontinued colors instead of guessing', () => {
    const s = calculateMaterials({ cells: ['c', 'd'] }, catalog);
    expect(s.lines.find((l) => l.colorId === 'c')!.packages).toBeNull();
    expect(s.totalPackages).toBeNull();
    expect(s.needsConfirmation.length).toBe(2);
  });

  it('throws on colors not in the catalog', () => {
    expect(() => calculateMaterials({ cells: ['zzz'] }, catalog)).toThrow();
  });
});

describe('mergeShoppingLists', () => {
  it('merges usage before applying wastage', () => {
    const m = mergeShoppingLists([{ cells: Array(15).fill('a') }, { cells: Array(15).fill('a') }], catalog);
    expect(m.lines[0]).toMatchObject({ required: 30, reserve: 3, purchaseNeeded: 33 });
  });
});

describe('estimateAccessories', () => {
  it('marks length-dependent necklace parts as needing confirmation', () => {
    const a = estimateAccessories('necklace', { width: 20, height: 24 });
    expect(a.find((x) => x.id === 'extender')!.status).toBe('needs-confirmation');
    expect(a.find((x) => x.id === 'clasp')!.status).toBe('calculated');
  });
});
