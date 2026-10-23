import { describe, expect, it } from 'vitest';
import { guessBackground, planLocalEdit } from '../ai/local';
import { ACTIVE_CATALOG, colorLab } from '../catalog';

const byId = new Map(ACTIVE_CATALOG.map((c) => [c.id, c]));

describe('AI local edit', () => {
  it('maps color words to a catalog color and keeps background', () => {
    const plan = planLocalEdit('改成金色', ACTIVE_CATALOG, 's01')!;
    expect(plan.map('s15')).toBe('s12');
    expect(plan.map('s01')).toBe('s01');
  });
  it('lighter makes non-background colors lighter', () => {
    const plan = planLocalEdit('浅一点', ACTIVE_CATALOG, 's01')!;
    const out = plan.map('s16');
    expect(colorLab(byId.get(out)!).L).toBeGreaterThan(colorLab(byId.get('s16')!).L);
  });
  it('returns null for instructions it cannot handle', () => {
    expect(planLocalEdit('做成立体的', ACTIVE_CATALOG, 's01')).toBeNull();
  });
  it('guesses background from borders', () => {
    const cells = ['a', 'a', 'a', 'a', 'x', 'a', 'a', 'a', 'a'];
    expect(guessBackground(cells, 3, 3)).toBe('a');
  });
});
