'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CreationMode, DesignIdea, DesignVariant, ItemType, Lang, Project, ProjectStatus } from '@/lib/types';
import { createPattern, snapshot, uid } from '@/lib/pattern';
import { defaultSize, renderMotif } from '@/lib/pattern/motifs';
import { translate, type MessageKey } from '@/lib/i18n';

type PurchaseKey = keyof Project['purchase'];

export interface NewProjectInput {
  name: string;
  description?: string;
  creationMode: CreationMode;
  itemType: ItemType;
  width: number;
  height: number;
  cells: string[];
  idea?: DesignIdea;
  variants?: DesignVariant[];
}

interface AppState {
  lang: Lang;
  wastageRate: number;
  projects: Record<string, Project>;
  order: string[];
  seeded: boolean;
  /** 最近一次 AI 生成会话 */
  session: { prompt: string; ideas: DesignIdea[]; pickedId: string | null; variants: DesignVariant[] };

  setLang: (l: Lang) => void;
  setWastageRate: (r: number) => void;
  setSession: (s: Partial<AppState['session']>) => void;
  createProject: (input: NewProjectInput) => string;
  updateCells: (id: string, cells: string[]) => void;
  saveVersion: (id: string, note: string) => void;
  restoreVersion: (id: string, version: number) => void;
  setStatus: (id: string, status: ProjectStatus) => void;
  markExported: (id: string) => void;
  togglePurchase: (id: string, key: PurchaseKey, itemId: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  seedDemo: () => void;
}

const now = () => new Date().toISOString();

function buildProject(input: NewProjectInput): Project {
  const id = uid('prj');
  const pattern = createPattern({ projectId: id, width: input.width, height: input.height, cells: input.cells });
  return {
    id,
    name: input.name,
    description: input.description ?? '',
    creationMode: input.creationMode,
    status: 'editing',
    itemType: input.itemType,
    createdAt: now(),
    updatedAt: now(),
    pattern,
    versions: [snapshot(pattern, 'v1 · 初始生成')],
    idea: input.idea,
    variants: input.variants ?? [],
    purchase: { bought: {}, outOfStock: {}, confirmed: {} },
  };
}

function demoProjects(): Project[] {
  const make = (name: string, itemType: ItemType, motif: Parameters<typeof renderMotif>[0], palette: string[], status: ProjectStatus, hoursAgo: number) => {
    const size = defaultSize(itemType);
    const p = buildProject({ name, itemType, creationMode: 'ai', width: size.width, height: size.height, cells: renderMotif(motif, palette, size) });
    const t = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
    return { ...p, status, createdAt: t, updatedAt: t, exportedAt: status === 'exported' ? t : undefined };
  };
  return [
    make('Matcha Garden 吊坠', 'pendant', 'leaf', ['s01', 's14', 's15', 's16', 's12'], 'editing', 2),
    make('Sakura 耳饰', 'earring', 'flower', ['s01', 's07', 's08', 's11', 's12'], 'exported', 26),
    make('Tokyo Night 手链', 'bracelet', 'night', ['s21', 's21', 's20', 's05', 's11'], 'purchasing', 72),
    make('Shibuya Grid 书签', 'bookmark', 'geometric', ['s02', 's19', 's20', 's21', 's10'], 'draft', 170),
  ];
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      lang: 'zh',
      wastageRate: 0.1,
      projects: {},
      order: [],
      seeded: false,
      session: { prompt: '', ideas: [], pickedId: null, variants: [] },

      setLang: (lang) => set({ lang }),
      setWastageRate: (wastageRate) => set({ wastageRate: Math.max(0, Math.min(0.5, wastageRate)) }),
      setSession: (s) => set({ session: { ...get().session, ...s } }),

      createProject: (input) => {
        const p = buildProject(input);
        set((st) => ({ projects: { ...st.projects, [p.id]: p }, order: [p.id, ...st.order] }));
        return p.id;
      },

      updateCells: (id, cells) =>
        set((st) => {
          const p = st.projects[id];
          if (!p) return st;
          return {
            projects: {
              ...st.projects,
              [id]: { ...p, status: p.status === 'draft' ? 'editing' : p.status, updatedAt: now(), pattern: { ...p.pattern, cells } },
            },
            order: [id, ...st.order.filter((x) => x !== id)],
          };
        }),

      saveVersion: (id, note) =>
        set((st) => {
          const p = st.projects[id];
          if (!p) return st;
          const version = p.pattern.version + 1;
          const pattern = { ...p.pattern, version };
          return { projects: { ...st.projects, [id]: { ...p, pattern, versions: [...p.versions, snapshot(pattern, note)], updatedAt: now() } } };
        }),

      restoreVersion: (id, version) =>
        set((st) => {
          const p = st.projects[id];
          const v = p?.versions.find((x) => x.version === version);
          if (!p || !v) return st;
          return {
            projects: {
              ...st.projects,
              [id]: { ...p, pattern: { ...p.pattern, cells: v.cells.slice(), width: v.width, height: v.height }, updatedAt: now() },
            },
          };
        }),

      setStatus: (id, status) =>
        set((st) => (st.projects[id] ? { projects: { ...st.projects, [id]: { ...st.projects[id], status } } } : st)),

      markExported: (id) =>
        set((st) =>
          st.projects[id] ? { projects: { ...st.projects, [id]: { ...st.projects[id], status: 'exported', exportedAt: now() } } } : st,
        ),

      togglePurchase: (id, key, itemId) =>
        set((st) => {
          const p = st.projects[id];
          if (!p) return st;
          const bucket = { ...p.purchase[key], [itemId]: !p.purchase[key][itemId] };
          const status: ProjectStatus = key === 'bought' && p.status !== 'exported' ? 'purchasing' : p.status;
          return { projects: { ...st.projects, [id]: { ...p, status, purchase: { ...p.purchase, [key]: bucket } } } };
        }),

      renameProject: (id, name) =>
        set((st) => (st.projects[id] ? { projects: { ...st.projects, [id]: { ...st.projects[id], name } } } : st)),

      deleteProject: (id) =>
        set((st) => {
          const projects = { ...st.projects };
          delete projects[id];
          return { projects, order: st.order.filter((x) => x !== id) };
        }),

      seedDemo: () => {
        if (get().seeded) return;
        const demos = demoProjects();
        set((st) => ({
          seeded: true,
          projects: { ...st.projects, ...Object.fromEntries(demos.map((p) => [p.id, p])) },
          order: [...st.order, ...demos.map((p) => p.id)],
        }));
      },
    }),
    { name: 'tsumii-store', version: 1 },
  ),
);

/** 避免 SSR 与 localStorage 数据不一致导致的水合警告 */
export function useHydrated(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const done = () => setOk(true);
    if (useApp.persist.hasHydrated()) done();
    const unsub = useApp.persist.onFinishHydration(done);
    return unsub;
  }, []);
  return ok;
}

export function useT() {
  const lang = useApp((s) => s.lang);
  return { lang, t: (k: MessageKey) => translate(lang, k) };
}
