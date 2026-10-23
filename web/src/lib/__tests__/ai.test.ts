import { describe, expect, it } from 'vitest';
import { parsePrompt } from '../ai/parse';
import { generateIdeasSync, refineSync } from '../ai/mock';
import { ACTIVE_CATALOG } from '../catalog';

const ids = new Set(ACTIVE_CATALOG.map((c) => c.id));
const example = '我想做一个绿色的 MIYUKI 串珠项链，日系极简风格，有植物元素，适合夏天佩戴，制作难度不要太高。';

describe('parsePrompt', () => {
  it('extracts the PRD example brief', () => {
    expect(parsePrompt(example)).toMatchObject({
      itemType: 'necklace', colors: ['green'], style: '日系极简', theme: '植物', scene: '夏季日常', difficulty: 'beginner',
    });
  });
  it('understands English and Japanese', () => {
    expect(parsePrompt('a pink sakura bracelet').itemType).toBe('bracelet');
    expect(parsePrompt('青いピアス').itemType).toBe('earring');
    expect(parsePrompt('青いピアス').colors).toContain('blue');
  });
});

describe('mock provider', () => {
  it('generates at least four distinct directions using only catalog colors', () => {
    const ideas = generateIdeasSync({ prompt: example, brief: parsePrompt(example), count: 4 });
    expect(ideas.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ideas.map((i) => i.name)).size).toBe(ideas.length);
    expect(new Set(ideas.map((i) => i.motif)).size).toBeGreaterThan(1);
    ideas.forEach((i) => i.palette.forEach((p) => expect(ids.has(p)).toBe(true)));
    expect(ideas[0].motif).toBe('leaf');
  });
  it('can produce up to 8 ideas', () => {
    expect(generateIdeasSync({ prompt: 'x', brief: parsePrompt('blue'), count: 8 })).toHaveLength(8);
  });
  it('marks 3D designs as needing review', () => {
    const ideas = generateIdeasSync({ prompt: example, brief: parsePrompt(example), count: 4 });
    expect(ideas.some((i) => i.feasibilityStatus === 'needs-review')).toBe(true);
  });
  it('refine keeps the motif and applies instructions', () => {
    const [idea] = generateIdeasSync({ prompt: example, brief: parsePrompt(example), count: 4 });
    const v = refineSync(idea, '改成手链');
    expect(v.idea.itemType).toBe('bracelet');
    expect(v.idea.motif).toBe(idea.motif);
    expect(v.ideaId).toBe(idea.id);
    const fewer = refineSync(idea, '使用更少的珠子颜色');
    expect(fewer.idea.palette.length).toBeLessThan(idea.palette.length);
    const sakura = refineSync(idea, '增加樱花元素');
    expect(sakura.idea.palette).toContain('s08');
    sakura.idea.palette.forEach((p) => expect(ids.has(p)).toBe(true));
  });
});
