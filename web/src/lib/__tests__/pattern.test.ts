import { describe, expect, it } from 'vitest';
import { ACTIVE_CATALOG, catalogById, validateCatalog, alternatives } from '../catalog';
import { countColors, createPattern, floodFill, mirrorHorizontal, removeIsolated, rowRuns, setCell, validatePattern, productSizeCm } from '../pattern';
import { convertToCells, limitColors, type PixelSource } from '../pattern/convert';
import { defaultSize, renderMotif } from '../pattern/motifs';

const byId = catalogById(ACTIVE_CATALOG);

describe('pattern ops', () => {
  it('createPattern validates dimensions', () => {
    expect(() => createPattern({ projectId: 'p', width: 2, height: 2, cells: ['s01'] })).toThrow();
  });
  it('setCell is immutable', () => {
    const c = ['a', 'a'];
    const n = setCell(c, 1, 'b');
    expect(c).toEqual(['a', 'a']);
    expect(n).toEqual(['a', 'b']);
  });
  it('floodFill fills only the connected region', () => {
    const cells = ['a', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'a'];
    expect(floodFill(cells, 3, 3, 0, 'x')).toEqual(['x', 'x', 'b', 'x', 'b', 'a', 'b', 'a', 'a']);
  });
  it('rowRuns produces left-to-right segments', () => {
    expect(rowRuns(['a', 'a', 'b', 'a', 'b', 'b', 'b', 'c'], 4, 1)).toEqual([
      { colorId: 'b', length: 3 },
      { colorId: 'c', length: 1 },
    ]);
  });
  it('removeIsolated replaces lone pixels', () => {
    const cells = ['a', 'a', 'a', 'a', 'x', 'a', 'a', 'a', 'a'];
    expect(removeIsolated(cells, 3, 3)[4]).toBe('a');
  });
  it('mirrorHorizontal copies left half to right', () => {
    expect(mirrorHorizontal(['a', 'b', 'c', 'd'], 4, 1)).toEqual(['a', 'b', 'b', 'a']);
  });
  it('validatePattern rejects unknown colors', () => {
    const p = createPattern({ projectId: 'p', width: 1, height: 2, cells: ['s01', 'nope'] });
    expect(validatePattern(p, byId).length).toBe(1);
  });
  it('productSizeCm uses Delica 11/0 approx size', () => {
    expect(productSizeCm(20, 24)).toEqual({ w: 3.2, h: 3.1 });
  });
});

describe('catalog', () => {
  it('sample catalog is internally consistent and clearly unverified', () => {
    expect(validateCatalog(ACTIVE_CATALOG)).toEqual([]);
    expect(ACTIVE_CATALOG.every((c) => !c.verified && c.code.startsWith('SAMPLE-'))).toBe(true);
  });
  it('alternatives excludes itself and sorts by ΔE', () => {
    const alt = alternatives('s15', ACTIVE_CATALOG, 3);
    expect(alt).toHaveLength(3);
    expect(alt.every((a) => a.color.id !== 's15')).toBe(true);
    expect(alt[0].deltaE).toBeLessThanOrEqual(alt[1].deltaE);
  });
});

function solidImage(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): PixelSource {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

describe('image → pattern conversion', () => {
  const base = { removeIsolated: false, symmetry: false, smallAreaMerge: false, catalog: ACTIVE_CATALOG, mode: 'faithful' as const };

  it('matches exact catalog colors and keeps grid size', () => {
    const img = solidImage(40, 40, (x) => (x < 20 ? [0x78, 0x94, 0x77, 255] : [0xf3, 0xc9, 0xd3, 255]));
    const cells = convertToCells(img, { ...base, cols: 10, rows: 10, maxColors: 8 });
    expect(cells).toHaveLength(100);
    expect(cells[0]).toBe('s15');
    expect(cells[9]).toBe('s07');
  });

  it('only ever outputs ids from the catalog', () => {
    const img = solidImage(30, 30, (x, y) => [x * 8, y * 8, (x + y) * 4, 255]);
    const cells = convertToCells(img, { ...base, cols: 15, rows: 15, maxColors: 20 });
    expect(cells.every((c) => byId.has(c))).toBe(true);
  });

  it('respects max color count', () => {
    const img = solidImage(60, 60, (x, y) => [x * 4, y * 4, 128, 255]);
    for (const max of [2, 4, 6]) {
      const cells = convertToCells(img, { ...base, cols: 20, rows: 20, maxColors: max });
      expect(countColors(cells).size).toBeLessThanOrEqual(max);
    }
    const low = convertToCells(img, { ...base, mode: 'low-color', cols: 20, rows: 20, maxColors: 10 });
    expect(countColors(low).size).toBeLessThanOrEqual(4);
  });

  it('transparent pixels become background', () => {
    const img = solidImage(10, 10, () => [0, 0, 0, 0]);
    const cells = convertToCells(img, { ...base, cols: 5, rows: 5, maxColors: 4, backgroundId: 's01' });
    expect(new Set(cells)).toEqual(new Set(['s01']));
  });

  it('symmetry option yields mirrored rows', () => {
    const img = solidImage(20, 20, (x, y) => [x * 12, y * 12, 60, 255]);
    const cells = convertToCells(img, { ...base, symmetry: true, cols: 10, rows: 10, maxColors: 6 });
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) expect(cells[y * 10 + x]).toBe(cells[y * 10 + 9 - x]);
  });

  it('limitColors merges the rarest color into its nearest neighbour', () => {
    const cells = ['s14', 's14', 's14', 's15', 's15', 's13'];
    const r = limitColors(cells, 2, byId);
    expect(countColors(r).size).toBe(2);
  });
});

describe('motifs', () => {
  it('render every motif at the default size with palette ids only', () => {
    const palette = ['s01', 's14', 's15', 's16', 's12'];
    for (const m of ['leaf', 'flower', 'diamond', 'gradient', 'night', 'geometric', 'heart'] as const) {
      const size = defaultSize('necklace');
      const cells = renderMotif(m, palette, size);
      expect(cells).toHaveLength(size.width * size.height);
      expect(cells.every((c) => palette.includes(c))).toBe(true);
      expect(countColors(cells).size).toBeGreaterThan(1);
    }
  });
});
