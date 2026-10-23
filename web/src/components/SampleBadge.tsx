'use client';

import { useT } from '@/store';

export function SampleBadge({ show }: { show: boolean }) {
  const { t } = useT();
  if (!show) return null;
  return (
    <span
      title="当前色卡为开发用示例数据，不对应 MIYUKI 官方色号。上线前请导入已核实的数据库。"
      className="inline-flex items-center gap-1 rounded-md bg-amber-soft px-2 py-1 text-[11px] text-amber-deep"
    >
      {t('common.sample')}
    </span>
  );
}
