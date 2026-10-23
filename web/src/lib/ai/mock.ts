// MockProvider：基于规则的确定性实现，用于开发和演示。
// 输出结构与真实模型一致；所有数量均为估算，并在界面上标注“不可作为采购依据”。

import type { DesignIdea, DesignVariant, Difficulty, ItemType, Motif } from '../types';
import type { AIProvider, GenerateRequest } from './index';
import { ACTIVE_CATALOG, catalogById, colorLab, nearestColor } from '../catalog';
import { defaultSize } from '../pattern/motifs';

interface Direction {
  name: string;
  motif: Motif;
  palette: string[];
  description: string;
  tags: string[];
  dimensional?: boolean;
  difficulty?: Difficulty;
}

// 色卡 id 见 src/lib/catalog/sample-delica-11-0.json
const DIRECTIONS: Record<string, Direction[]> = {
  green: [
    { name: 'Matcha Garden', motif: 'leaf', palette: ['s01', 's14', 's15', 's16', 's12'], description: '抹茶绿与象牙白搭配，植物叶片主题，风格清新。', tags: ['清新', '植物', '日常'] },
    { name: 'Ginza Emerald', motif: 'diamond', palette: ['s01', 's17', 's13', 's16', 's12'], description: '祖母绿几何元素，精致、现代，适合日常佩戴。', tags: ['精致', '几何', '现代'], difficulty: 'intermediate' },
    { name: 'Tokyo Botanical', motif: 'flower', palette: ['s18', 's13', 's14', 's11', 's08'], description: '浅绿色与透明珠子结合，采用日式植物与立体花卉元素。', tags: ['植物', '花卉', '透明感'], dimensional: true, difficulty: 'intermediate' },
    { name: 'Forest Light', motif: 'gradient', palette: ['s01', 's13', 's14', 's15', 's16'], description: '深浅绿色渐变，营造森林光影效果。', tags: ['渐变', '光影', '自然'] },
  ],
  pink: [
    { name: 'Sakura Breeze', motif: 'flower', palette: ['s01', 's07', 's08', 's11', 's12'], description: '浅樱粉花瓣与蜜黄花心，春日感的平面樱花。', tags: ['樱花', '春天', '温柔'] },
    { name: 'Ginza Blush', motif: 'diamond', palette: ['s02', 's07', 's09', 's12', 's08'], description: '粉色几何菱形配金色点缀，精致利落。', tags: ['精致', '几何'], difficulty: 'intermediate' },
    { name: 'Ueno Spring', motif: 'leaf', palette: ['s01', 's07', 's08', 's09', 's14'], description: '樱色叶片与嫩绿点缀，上野公园的春天。', tags: ['自然', '花卉'] },
    { name: 'Hanami Petals', motif: 'flower', palette: ['s18', 's07', 's08', 's12', 's11'], description: '透明珠与层叠立体花瓣，适合耳坠与吊坠。', tags: ['立体', '花卉', '透明感'], dimensional: true, difficulty: 'intermediate' },
  ],
  blue: [
    { name: 'Tokyo Night', motif: 'night', palette: ['s21', 's21', 's20', 's05', 's11'], description: '深蓝夜空与城市天际线，点点灯火。', tags: ['夜景', '都市'] },
    { name: 'Sumida Wave', motif: 'gradient', palette: ['s01', 's19', 's20', 's21', 's21'], description: '天蓝到夜蓝的渐变，像隅田川的暮色。', tags: ['渐变', '安静'] },
    { name: 'Ginza Sapphire', motif: 'diamond', palette: ['s02', 's20', 's19', 's21', 's12'], description: '蓝宝石几何切面，金色收边，适合通勤。', tags: ['几何', '精致'], difficulty: 'intermediate' },
    { name: 'Shibuya Grid', motif: 'geometric', palette: ['s02', 's19', 's20', 's21', 's10'], description: '涩谷街头的斜纹几何，干净利落。', tags: ['都市', '几何'] },
  ],
  neutral: [
    { name: 'Ginza Pearl', motif: 'diamond', palette: ['s02', 's01', 's03', 's04', 's12'], description: '象牙白与暖灰的低调几何，极简精致。', tags: ['极简', '精致'] },
    { name: 'Shibuya Lines', motif: 'geometric', palette: ['s02', 's04', 's05', 's06', 's10'], description: '黑白斜纹加一抹朱红，都市感。', tags: ['几何', '都市'] },
    { name: 'Asakusa Heart', motif: 'heart', palette: ['s01', 's10', 's09', 's06', 's12'], description: '朱红爱心与复古金色，传统而温暖。', tags: ['复古', '爱心'] },
    { name: 'Paper Garden', motif: 'leaf', palette: ['s02', 's03', 's23', 's05', 's12'], description: '米色与可可棕的纸艺叶片，安静质朴。', tags: ['质朴', '植物'] },
  ],
};

const FAMILY_OF: Record<string, keyof typeof DIRECTIONS> = {
  green: 'green',
  pink: 'pink',
  red: 'pink',
  purple: 'pink',
  blue: 'blue',
  black: 'neutral',
  white: 'neutral',
  gold: 'neutral',
};

const byId = catalogById(ACTIVE_CATALOG);
const hexOf = (id: string) => byId.get(id)?.hex ?? '#CCCCCC';

function strandFor(palette: string[], motif: Motif): string[] {
  const [bg, c1, c2, c3] = palette;
  if (motif === 'gradient') return [c1, c1, c2, c2, c3, c3, c2, c2].map(hexOf);
  if (motif === 'night') return [c1, c1, c2, palette[4] ?? c2].map(hexOf);
  return [bg, bg, c1, bg, bg, c2].map(hexOf);
}

function estimate(itemType: ItemType, palette: string[]) {
  const size = defaultSize(itemType);
  const motifBeads = size.width * size.height;
  const strand = itemType === 'necklace' ? 260 : itemType === 'bracelet' ? 0 : 0;
  // 估算值取整到 10
  return { colors: new Set(palette).size, beads: Math.round((motifBeads + strand) / 10) * 10 };
}

let seq = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function buildIdea(dir: Direction, req: { prompt: string; itemType: ItemType; difficulty: Difficulty; style: string }): DesignIdea {
  const est = estimate(req.itemType, dir.palette);
  const difficulty: Difficulty = req.difficulty === 'beginner' && !dir.difficulty ? 'beginner' : dir.difficulty ?? req.difficulty;
  return {
    id: nextId('idea'),
    prompt: req.prompt,
    name: dir.name,
    itemType: req.itemType,
    style: req.style,
    styleTags: dir.tags,
    description: dir.description,
    palette: dir.palette.slice(),
    strandSequence: strandFor(dir.palette, dir.motif),
    motif: dir.motif,
    estimatedColors: est.colors,
    estimatedBeads: est.beads,
    difficulty,
    feasibilityStatus: dir.dimensional ? 'needs-review' : 'flat-ok',
    feasibilityNote: dir.dimensional
      ? '含立体花朵结构，MVP 只能转换平面部分，立体部分需人工确认'
      : '平面方格结构，可直接转换为图纸',
    recommendedBead: 'delica-11-0',
  };
}

export function generateIdeasSync(req: GenerateRequest): DesignIdea[] {
  const family = FAMILY_OF[req.brief.colors[0]] ?? 'green';
  let dirs = DIRECTIONS[family].slice();
  // 主题偏好：把匹配的 motif 排到前面
  const themeMotif: Record<string, Motif> = { 樱花: 'flower', 植物: 'leaf', 花卉: 'flower', 夜景: 'night', 几何: 'geometric', 爱心: 'heart' };
  const want = themeMotif[req.brief.theme];
  if (want) dirs = dirs.sort((a, b) => Number(b.motif === want) - Number(a.motif === want));
  // 不足 count 时从其他色系补齐
  const others = Object.entries(DIRECTIONS)
    .filter(([k]) => k !== family)
    .flatMap(([, v]) => v);
  while (dirs.length < req.count && others.length) dirs.push(others.shift()!);
  return dirs.slice(0, Math.max(4, Math.min(8, req.count))).map((d) =>
    buildIdea(d, { prompt: req.prompt, itemType: req.brief.itemType, difficulty: req.brief.difficulty, style: req.brief.style }),
  );
}

function shiftLightness(id: string, delta: number): string {
  const c = byId.get(id);
  if (!c) return id;
  const lab = colorLab(c);
  return nearestColor({ L: Math.max(0, Math.min(100, lab.L + delta)), a: lab.a * 0.85, b: lab.b * 0.85 }, ACTIVE_CATALOG).id;
}

const includesAny = (t: string, ws: string[]) => ws.some((w) => t.includes(w));

/** 二次设计：保留原设计方向（motif、配色关系），按指令细化 */
export function refineSync(idea: DesignIdea, instruction: string, parentVariantId?: string): DesignVariant {
  const t = instruction.toLowerCase();
  const next: DesignIdea = { ...idea, id: nextId('idea'), palette: idea.palette.slice(), styleTags: idea.styleTags.slice() };
  const notes: string[] = [];

  if (includesAny(t, ['浅', 'lighter', 'light', '明る'])) {
    next.palette = next.palette.map((id, i) => (i === 0 ? id : shiftLightness(id, 12)));
    notes.push('整体颜色提亮');
  }
  if (includesAny(t, ['深', 'darker', '暗'])) {
    next.palette = next.palette.map((id, i) => (i === 0 ? id : shiftLightness(id, -12)));
    notes.push('整体颜色加深');
  }
  if (includesAny(t, ['更少', 'fewer', '少な'])) {
    next.palette = next.palette.slice(0, Math.max(3, next.palette.length - 2));
    notes.push('减少用色');
  }
  if (includesAny(t, ['新手', 'beginner', '初心'])) {
    next.difficulty = 'beginner';
    next.palette = next.palette.slice(0, Math.max(3, Math.min(4, next.palette.length)));
    notes.push('降低难度，减少颜色切换');
  }
  if (includesAny(t, ['精致', 'elegant', '上品'])) {
    if (!next.styleTags.includes('精致')) next.styleTags.push('精致');
    notes.push('细节更精致');
  }
  if (includesAny(t, ['樱', 'sakura', '桜'])) {
    next.palette = next.palette.filter((p) => p !== 's08').concat(['s08']);
    if (!next.styleTags.includes('樱花')) next.styleTags.push('樱花');
    notes.push('加入樱花粉点缀');
  }
  if (includesAny(t, ['金属', 'metal', '金色'])) {
    next.palette = next.palette.filter((p) => byId.get(p)?.finish !== 'metallic');
    if (next.palette.length < 2) next.palette.push('s01');
    notes.push('减少金属色与金属配件');
  }
  if (includesAny(t, ['手链', 'bracelet', 'ブレスレット'])) {
    next.itemType = 'bracelet';
    notes.push('改为手链');
  }
  if (includesAny(t, ['短款', 'short', 'ショート'])) {
    next.itemType = 'necklace';
    notes.push('改为短款项链（约 38 cm）');
  }
  if (!notes.length) notes.push(`按要求细化：${instruction.trim()}`);

  const est = estimate(next.itemType, next.palette);
  next.estimatedColors = est.colors;
  next.estimatedBeads = est.beads;
  next.strandSequence = strandFor(next.palette, next.motif);
  next.description = `${idea.description}（${notes.join('；')}）`;

  return {
    id: nextId('var'),
    ideaId: idea.id,
    parentVariantId,
    refinementPrompt: instruction,
    idea: next,
    selected: true,
    createdAt: new Date().toISOString(),
  };
}

export const mockProvider: AIProvider = {
  name: 'mock',
  async generateIdeas(req) {
    return generateIdeasSync(req);
  },
  async refine(idea, instruction, parentVariantId) {
    return refineSync(idea, instruction, parentVariantId);
  },
};
