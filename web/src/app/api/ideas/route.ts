import { NextResponse } from 'next/server';
import { getProvider, parsePrompt } from '@/lib/ai';
import { createClient } from '@/lib/api/client';
import { requireInvite } from '@/lib/invite';
import type { ParsedBrief } from '@/lib/types';

// 设置 BACKEND_URL 时转发到 FastAPI 后端（方案会存入数据库）；否则使用前端内置的 MockProvider。
const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  const denied = requireInvite(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; count?: number; brief?: Partial<ParsedBrief> };
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: '请先描述你的想法' }, { status: 400 });
  const count = Math.max(4, Math.min(8, Number(body.count) || 4));
  try {
    if (BACKEND_URL) {
      const api = createClient({ baseUrl: BACKEND_URL, userId: req.headers.get('x-user-id') ?? undefined });
      return NextResponse.json(await api.generateIdeas(prompt, count, body.brief));
    }
    const brief = { ...parsePrompt(prompt), ...(body.brief ?? {}) };
    const ideas = await getProvider().generateIdeas({ prompt, brief, count });
    return NextResponse.json({ brief, ideas });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
