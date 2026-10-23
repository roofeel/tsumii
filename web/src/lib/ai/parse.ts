import type { Difficulty, ItemType, ParsedBrief } from '../types';

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const ITEM_WORDS: [ItemType, string[]][] = [
  ['bracelet', ['手链', '手环', 'bracelet', 'ブレスレット']],
  ['earring', ['耳饰', '耳环', '耳坠', '耳钉', 'earring', 'ピアス', 'イヤリング']],
  ['bookmark', ['书签', 'bookmark', 'しおり']],
  ['brooch', ['胸针', 'brooch', 'ブローチ']],
  ['pendant', ['吊坠', '挂饰', 'pendant', 'charm', 'チャーム', 'ペンダント']],
  ['necklace', ['项链', 'necklace', 'ネックレス']],
];

export const COLOR_WORDS: Record<string, string[]> = {
  green: ['绿', '抹茶', 'green', 'matcha', '緑', 'グリーン', '抹茶'],
  pink: ['粉', '樱', 'pink', 'sakura', 'ピンク', '桜'],
  blue: ['蓝', '夜', 'blue', 'navy', 'night', '青', 'ブルー', '夜'],
  white: ['白', 'white', 'ホワイト'],
  gold: ['金', 'gold', 'ゴールド'],
  red: ['红', 'red', '赤', 'レッド'],
  black: ['黑', 'black', '黒', 'ブラック'],
  purple: ['紫', 'purple', 'lavender', 'ラベンダー'],
};

const STYLE_WORDS: [string, string[]][] = [
  ['日系极简', ['极简', '簡約', '简约', 'minimal', 'ミニマル', 'シンプル']],
  ['复古', ['复古', 'retro', 'vintage', 'レトロ']],
  ['可爱', ['可爱', 'cute', 'かわいい']],
  ['几何', ['几何', 'geometric', '幾何']],
  ['精致', ['精致', 'elegant', '上品']],
];

const THEME_WORDS: [string, string[]][] = [
  ['樱花', ['樱花', 'sakura', 'cherry', '桜']],
  ['植物', ['植物', '叶', 'leaf', 'plant', 'botanical', '葉', 'ボタニカル']],
  ['花卉', ['花', 'flower', 'floral', 'フラワー']],
  ['夜景', ['夜景', 'night', '夜']],
  ['几何', ['几何', 'geometric', '幾何']],
  ['爱心', ['爱心', 'heart', 'ハート']],
];

const SCENE_WORDS: [string, string[]][] = [
  ['夏季日常', ['夏', 'summer']],
  ['春季日常', ['春', 'spring']],
  ['通勤', ['通勤', '上班', 'office', 'work']],
  ['送礼', ['礼物', '送', 'gift', 'プレゼント']],
];

export function parsePrompt(raw: string): ParsedBrief {
  const text = raw.toLowerCase();
  const itemType = ITEM_WORDS.find(([, w]) => has(text, w))?.[0] ?? 'necklace';
  const colors = Object.entries(COLOR_WORDS)
    .filter(([, w]) => has(text, w))
    .map(([k]) => k);
  const style = STYLE_WORDS.find(([, w]) => has(text, w))?.[0] ?? '日系极简';
  const theme = THEME_WORDS.find(([, w]) => has(text, w))?.[0] ?? '';
  const scene = SCENE_WORDS.find(([, w]) => has(text, w))?.[0] ?? '日常';
  let difficulty: Difficulty = 'intermediate';
  if (has(text, ['不要太高', '不太难', '简单', '新手', '入门', 'easy', 'beginner', '初心者', 'かんたん'])) difficulty = 'beginner';
  else if (has(text, ['复杂', '高难', 'advanced', '上級'])) difficulty = 'advanced';
  return { itemType, colors: colors.length ? colors : ['green'], style, theme, scene, difficulty, freeText: raw.trim() };
}
