// 数据模型，对应 PRD 第七章。前端 MVP 以 localStorage 持久化，后端（FastAPI + PostgreSQL）接入时沿用同一结构。

export type Lang = 'zh' | 'en' | 'ja';

export type BeadType = 'delica-11-0';
/** MVP 只支持平面方格排列（Square / Loom 视觉）。Peyote、Brick 在 Phase 2 增加。 */
export type LayoutType = 'square';

export type ItemType = 'necklace' | 'bracelet' | 'earring' | 'pendant' | 'bookmark' | 'brooch';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type CreationMode = 'image' | 'ai';
export type ProjectStatus = 'draft' | 'editing' | 'exported' | 'purchasing';

/** CIELAB 颜色（D65） */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** BeadCatalog：MIYUKI 珠子色号及材料属性 */
export interface BeadColor {
  id: string;
  brand: 'MIYUKI';
  series: 'Delica';
  size: '11/0';
  /** 官方色号。只允许来自已核实数据源。 */
  code: string;
  name: string;
  nameZh: string;
  nameJa?: string;
  /** RGB 参考颜色 */
  hex: string;
  finish: string;
  discontinued: boolean;
  /** 每包可用颗数（若商家按包销售） */
  packBeads?: number;
  /** 每包克数 + 每克颗数（若商家按克销售），两者都可信时才换算 */
  gramsPerPack?: number;
  beadsPerGram?: number;
  /** 是否经过核实。false 表示示例数据，界面会显著标注。 */
  verified: boolean;
}

export interface PatternComponent {
  id: string;
  name: string;
  /** 该组件在网格中的范围 */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pattern：最终可制作的结构化图纸（不是图片） */
export interface Pattern {
  id: string;
  projectId: string;
  variantId?: string;
  beadType: BeadType;
  layoutType: LayoutType;
  width: number;
  height: number;
  /** 行优先，长度 = width * height，值为 BeadColor.id */
  cells: string[];
  components: PatternComponent[];
  version: number;
}

export interface PatternVersion {
  version: number;
  cells: string[];
  width: number;
  height: number;
  note: string;
  createdAt: string;
}

export interface ParsedBrief {
  itemType: ItemType;
  colors: string[];
  style: string;
  theme: string;
  scene: string;
  difficulty: Difficulty;
  budget?: string;
  freeText: string;
}

export type Feasibility = 'flat-ok' | 'needs-review';
export type Motif = 'leaf' | 'flower' | 'diamond' | 'gradient' | 'night' | 'geometric' | 'heart';

/** DesignIdea：AI 创意候选 */
export interface DesignIdea {
  id: string;
  projectId?: string;
  prompt: string;
  name: string;
  itemType: ItemType;
  style: string;
  styleTags: string[];
  description: string;
  /** 色卡 id，第一个通常为底色 */
  palette: string[];
  /** 项链/手链主链的珠子颜色循环（hex） */
  strandSequence: string[];
  motif: Motif;
  /** 估算值，不可作为采购依据 */
  estimatedColors: number;
  estimatedBeads: number;
  difficulty: Difficulty;
  feasibilityStatus: Feasibility;
  feasibilityNote: string;
  recommendedBead: BeadType;
  previewImage?: string;
}

/** DesignVariant：方案细化版本 */
export interface DesignVariant {
  id: string;
  ideaId: string;
  parentVariantId?: string;
  refinementPrompt: string;
  idea: DesignIdea;
  selected: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  creationMode: CreationMode;
  status: ProjectStatus;
  itemType: ItemType;
  createdAt: string;
  updatedAt: string;
  pattern: Pattern;
  versions: PatternVersion[];
  idea?: DesignIdea;
  variants: DesignVariant[];
  /** 最近一次导出制作图纸的时间 */
  exportedAt?: string;
  /** 采购清单中的状态 */
  purchase: { bought: Record<string, boolean>; outOfStock: Record<string, boolean>; confirmed: Record<string, boolean> };
}

export interface MaterialLine {
  colorId: string;
  code: string;
  name: string;
  nameZh: string;
  hex: string;
  verified: boolean;
  required: number;
  reserve: number;
  /** = required + reserve（MVP 不接入库存） */
  purchaseNeeded: number;
  /** null 表示缺少可信包装参数，需要用户确认 */
  packages: number | null;
  beadsPerPackage: number | null;
  discontinued: boolean;
}

export interface MaterialSummary {
  lines: MaterialLine[];
  totalBeads: number;
  colorCount: number;
  totalPackages: number | null;
  needsConfirmation: string[];
}

export type AccessoryStatus = 'calculated' | 'estimated' | 'needs-confirmation';

export interface AccessoryLine {
  id: string;
  name: string;
  quantity: string;
  reason: string;
  status: AccessoryStatus;
}
