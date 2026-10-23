import { describe, expect, it } from 'vitest';
import type { BeadColor } from '../types';
import { ACTIVE_CATALOG } from '../catalog';
import { calculateMaterials, estimateAccessories, mergeShoppingLists } from '../materials';
import { createPattern, snapshot, validatePattern } from '../pattern';
import { expandStrand, hasStrand, strandBeadCount, strandForItem, strandRepeats, strandSequenceIds } from '../pattern/strand';
import { generateIdeasSync } from '../ai/mock';
import { parsePrompt } from '../ai/parse';

const color = (id: string): BeadColor => ({
  id, brand: 'MIYUKI', series: 'Delica', size: '11/0', code: `T-${id}`, name: id, nameZh: id, hex: '#808080',
  finish: 'opaque', discontinued: false, packBeads: 100, verified: false,
});
const catalog = new Map<string, BeadColor>([['a', color('a')], ['b', color('b')]]);

describe('strand', () => {
  it('counts beads from length and expands the repeat unit', () => {
    expect(strandBeadCount(40)).toBe(308);
    expect(strandBeadCount(13)).toBe(100);
    const s = { sequence: ['a', 'a', 'b'], lengthCm: 13 };
    const beads = expandStrand(s);
    expect(beads).toHaveLength(100);
    expect(beads.slice(0, 4)).toEqual(['a', 'a', 'b', 'a']);
    expect(strandRepeats(s)).toEqual({ total: 100, repeats: 33, remainder: 1 });
  });

  it('only necklaces get a strand', () => {
    expect(hasStrand('necklace')).toBe(true);
    expect(hasStrand('pendant')).toBe(false);
    expect(hasStrand('bracelet')).toBe(false);
    expect(strandForItem('bracelet', ['s01'], ACTIVE_CATALOG)).toBeUndefined();
    expect(strandForItem('necklace', ['s01', 's14'], ACTIVE_CATALOG)).toEqual({ sequence: ['s01', 's14'], lengthCm: 40 });
  });

  it('maps legacy hex sequences to catalog ids', () => {
    const s01 = ACTIVE_CATALOG.find((c) => c.id === 's01')!;
    expect(strandSequenceIds([s01.hex, 's14', 'nope'], ACTIVE_CATALOG)).toEqual(['s01', 's14']);
  });

  it('includes strand beads in materials and merged lists', () => {
    const strand = { sequence: ['a', 'a', 'b'], lengthCm: 13 };
    const s = calculateMaterials({ cells: ['b', 'b'], strand }, catalog, { wastageRate: 0 });
    expect(s.totalBeads).toBe(102);
    expect(s.lines.find((l) => l.colorId === 'a')!.required).toBe(67);
    expect(s.lines.find((l) => l.colorId === 'b')!.required).toBe(35);
    expect(mergeShoppingLists([{ cells: ['a'], strand }, { cells: ['a'] }], catalog).totalBeads).toBe(102);
  });

  it('adds strand thread and uses strand length for the extender', () => {
    const a = estimateAccessories('necklace', { width: 20, height: 24, strand: { sequence: ['a'], lengthCm: 40 } });
    expect(a.find((x) => x.id === 'strand-thread')!.quantity).toBe('约 0.7 m');
    expect(a.find((x) => x.id === 'extender')!.reason).toContain('40 cm');
  });

  it('keeps the strand in patterns, snapshots and validation', () => {
    const p = createPattern({ projectId: 'p', width: 1, height: 1, cells: ['a'], strand: { sequence: ['a', 'zzz'], lengthCm: 40 } });
    expect(snapshot(p, 'v1').strand).toEqual({ sequence: ['a', 'zzz'], lengthCm: 40 });
    expect(validatePattern(p, catalog).join()).toContain('zzz');
  });

  it('mock ideas use catalog ids for the strand and count strand beads for necklaces', () => {
    const ideas = generateIdeasSync({ prompt: '绿色项链', brief: parsePrompt('绿色项链'), count: 4 });
    const ids = new Set(ACTIVE_CATALOG.map((c) => c.id));
    expect(ideas.every((i) => i.strandSequence.every((c) => ids.has(c)))).toBe(true);
    expect(ideas[0].estimatedBeads).toBe(Math.round((20 * 24 + 308) / 10) * 10);
  });
});
