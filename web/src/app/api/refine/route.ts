import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai';
import { createClient } from '@/lib/api/client';
import { requireInvite } from '@/lib/invite';
import type { DesignIdea } from '@/lib/types';

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  const denied = requireInvite(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { idea?: DesignIdea; rootIdeaId?: string; instruction?: string; parentVariantId?: string };
  if (!body.idea || !body.instruction?.trim()) {
    return NextResponse.json({ error: '缺少方案或修改要求' }, { status: 400 });
  }
  try {
    if (BACKEND_URL) {
      // 后端以原始方案 id + 父版本 id 定位，细化结果存为新的 DesignVariant
      const api = createClient({ baseUrl: BACKEND_URL, userId: req.headers.get('x-user-id') ?? undefined });
      const variant = await api.refine(body.rootIdeaId ?? body.idea.id, body.instruction, body.parentVariantId);
      return NextResponse.json({ variant: { ...variant, selected: true } });
    }
    const variant = await getProvider().refine(body.idea, body.instruction, body.parentVariantId);
    return NextResponse.json({ variant });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
