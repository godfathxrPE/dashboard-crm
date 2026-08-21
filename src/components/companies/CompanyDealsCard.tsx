'use client';

import { useRouter } from 'next/navigation';
import { FolderKanban } from 'lucide-react';
import { DealHealthDot } from '@/components/shared/DealHealthDot';
import { getDealHealth, compareByNextAction } from '@/lib/utils/deal-health';
import { isTerminalDeal } from '@/lib/utils/company-360';
import { projectHref } from '@/lib/utils/project-href';
import { formatBudget } from '@/lib/validators/project';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 — секция «Сделки» карточки компании.
// Вынесена из CompanyDetail без изменения поведения: ARCH-ревью прямо запрещает
// растить detail-страницы (avoid 2k LOC file), а после пересборки карточка
// композирует четыре такие секции.
// ═══════════════════════════════════════════════════════

interface CompanyDealsCardProps {
  deals: Project[];
  stages: PipelineStage[] | undefined;
  canCreate: boolean;
  onCreate: () => void;
}

export function CompanyDealsCard({ deals, stages, canCreate, onCreate }: CompanyDealsCardProps) {
  const router = useRouter();
  // Открытые вверх, терминальные вниз — тот же порядок, что в воронке.
  const sorted = [...deals].sort(compareByNextAction);

  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <FolderKanban size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Сделки</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{deals.length}</span>
        {canCreate && (
          <button onClick={onCreate}
            className="ml-auto text-xs text-text-mute transition-colors hover:text-text-main">
            + Сделка
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs italic text-text-mute">Нет сделок. Привяжи компанию при создании сделки.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((p) => {
            // Стадия из pipeline_stages (stage_id — истина, legacy `stage` не читаем)
            const stageName = (p.stage_id ? stages?.find((s) => s.id === p.stage_id)?.name : null) ?? '—';
            const dh = getDealHealth(p);
            // Закрытые приглушены — вес строки отделяет их от открытых без
            // отдельного заголовка.
            const closed = isTerminalDeal(p.status);
            return (
              <button key={p.id} onClick={() => router.push(projectHref(p))}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                <DealHealthDot health={dh} />
                <span className={closed ? 'truncate text-sm text-text-mute' : 'truncate text-sm text-text-main'}>{p.name}</span>
                <span data-tag className={closed
                  ? 'shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute'
                  : 'shrink-0 rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent'}>
                  {stageName}
                </span>
                {p.budget != null && (
                  <span className={closed
                    ? 'ml-auto shrink-0 text-xs tabular-nums text-text-mute'
                    : 'ml-auto shrink-0 text-xs tabular-nums text-text-dim'}>
                    {formatBudget(p.budget)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
