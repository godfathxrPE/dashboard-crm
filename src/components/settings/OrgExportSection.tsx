'use client';

import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useOrgExport } from '@/lib/hooks/use-org-export';
import { EXPORT_SCOPE_HINT } from '@/lib/domain/org-export';

/**
 * S-EXPORT-1 — «Данные организации»: выгрузка в JSON одной кнопкой.
 *
 * ⚠️ Секция видна ТОЛЬКО владельцу, хотя RPC доступна любому члену org.
 * Причина не в правах, а в честности: `export_org_data` — SECURITY INVOKER,
 * и объём выгрузки равен тому, что вызывающий видит по RLS. У manager файл
 * вышел бы меньше, но выглядел бы точно так же — кнопка создавала бы ложное
 * впечатление, что организация выгружена целиком.
 *
 * Подтверждения нет намеренно: операция читающая, отменять нечего.
 * (`window.confirm` в проекте запрещён, а `InlineConfirm` здесь был бы шумом.)
 */
export function OrgExportSection() {
  const { data: role } = useOrgRole();
  const exportOrg = useOrgExport();

  if (role !== 'owner') return null;

  const run = () => {
    exportOrg.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          `Выгружено ${res.rowCount.toLocaleString('ru-RU')} строк из ${res.tableCount} таблиц`,
          { description: res.fileName },
        );
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Не удалось выгрузить данные');
      },
    });
  };

  return (
    <div className="sheet p-4">
      <div className="mb-3 flex items-center gap-2">
        <Download size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Данные организации</h2>
      </div>

      <p className="mb-3 text-xs text-text-mute">
        Выгрузка бизнес-данных организации одним JSON-файлом — чтобы данные не были
        заперты в одной системе. Операция читающая, ничего не меняет.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={exportOrg.isPending}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white
          transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {exportOrg.isPending ? 'Готовлю выгрузку…' : 'Выгрузить в JSON'}
      </button>

      <p className="mt-2 text-[0.6875rem] leading-snug text-text-mute">{EXPORT_SCOPE_HINT}</p>
    </div>
  );
}
