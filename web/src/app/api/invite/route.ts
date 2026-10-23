import { NextResponse } from 'next/server';
import { isValidInvite } from '@/lib/invite';

// 校验邀请码，供弹窗在保存前确认
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code?.trim()) return NextResponse.json({ error: '请输入邀请码' }, { status: 400 });
  if (!isValidInvite(body.code)) return NextResponse.json({ error: '邀请码无效' }, { status: 401 });
  return NextResponse.json({ ok: true });
}
