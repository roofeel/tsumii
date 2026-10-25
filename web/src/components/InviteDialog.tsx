'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/store';

const INVITE_HEADER = 'x-invite-code';

/** 输入邀请码的弹窗：先调用 /api/invite 校验，通过后才提交 */
function InviteDialog({ onSubmit, onCancel }: { onSubmit: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return setError('请输入邀请码');
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: value }) });
      if (res.ok) return onSubmit(value);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? '邀请码无效');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card flex w-full max-w-sm flex-col gap-3 p-5 shadow-xl"
      >
        <h2 id="invite-title" className="text-[17px] font-bold">
          输入邀请码
        </h2>
        <p className="text-[13px] leading-relaxed text-body">AI 设计功能目前仅对受邀用户开放，输入邀请码后即可使用。</p>
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="邀请码"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'invite-error' : undefined}
          className="field font-mono"
        />
        {error && (
          <p id="invite-error" role="alert" className="text-xs text-sakura-deep">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn-primary" disabled={checking}>
            {checking ? '验证中…' : '确定'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * 包装调用 AI 的请求：自动带上邀请码；服务端返回 invite_required 时弹窗输入，验证通过后重试。
 * 用户取消时 withInvite 返回 null。
 */
export function useInviteGate(): { requestInvite: () => Promise<boolean>; withInvite: (run: (headers: Record<string, string>) => Promise<Response>) => Promise<Response | null>; dialog: ReactNode } {
  const setInviteCode = useApp((s) => s.setInviteCode);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((code: string | null) => void) | null>(null);

  const ask = () =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });
  const close = useCallback((code: string | null) => {
    setOpen(false);
    resolver.current?.(code);
    resolver.current = null;
  }, []);
  const cancel = useCallback(() => close(null), [close]);

  const requestInvite = useCallback(async () => {
    const code = await ask();
    if (!code) return false;
    setInviteCode(code);
    return true;
  }, [setInviteCode]);

  const withInvite = useCallback(
    async (run: (headers: Record<string, string>) => Promise<Response>) => {
      let code = useApp.getState().inviteCode;
      // 最多重试 3 次，避免邀请码在服务端失效时无限弹窗
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await run(code ? { [INVITE_HEADER]: code } : {});
        if (res.status !== 401) return res;
        const data = (await res.clone().json().catch(() => null)) as { code?: string } | null;
        if (data?.code !== 'invite_required') return res;
        setInviteCode(null);
        code = await ask();
        if (!code) return null;
        setInviteCode(code);
      }
      return null;
    },
    [setInviteCode],
  );

  return { requestInvite, withInvite, dialog: open ? <InviteDialog onSubmit={(c) => close(c)} onCancel={cancel} /> : null };
}
