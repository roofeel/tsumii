// 邀请码：调用 AI 的接口需要有效邀请码。INVITE_CODES 为逗号分隔的列表，只在服务端读取。
// 未配置 INVITE_CODES 时不做限制（本地开发用）；生产环境务必配置。

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const INVITE_HEADER = 'x-invite-code';

function inviteCodes(): string[] {
  return (process.env.INVITE_CODES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

export function inviteRequired(): boolean {
  return inviteCodes().length > 0;
}

export function isValidInvite(code: string | null | undefined): boolean {
  const codes = inviteCodes();
  if (!codes.length) return true;
  const given = Buffer.from((code ?? '').trim());
  // 逐个做定长比较，避免通过响应时间猜测邀请码
  return codes.some((c) => {
    const want = Buffer.from(c);
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

/** 校验请求头中的邀请码；无效时返回 401 响应，有效时返回 null */
export function requireInvite(req: Request): NextResponse | null {
  if (isValidInvite(req.headers.get(INVITE_HEADER))) return null;
  return NextResponse.json({ error: '请输入有效的邀请码', code: 'invite_required' }, { status: 401 });
}
