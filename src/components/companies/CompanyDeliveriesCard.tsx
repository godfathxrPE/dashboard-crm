'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, PlusCircle } from 'lucide-react';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { SpawnWizard } from '@/components/projects/SpawnWizard';
import { projectHref } from '@/lib/utils/project-href';
import { formatDateShort } from '@/lib/utils/dates';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 — секция «Внедрения» карточки компании.
//
// Новое против прежней версии:
//  · тонкий прогресс-бар (только когда счётчик задач заведён);
//  · CTA «Запустить внедрение» по won-сделке без дочернего delivery — дыра
//    «продали и забыли» видна ровно там, где на неё смотрят, а не в отчёте.
// ═══════════════════════════════════════════════════════

/** Сколько «забытых» won-сделок показываем строками; остальное — счётчиком. */
const CTA_LIMIT = 2;

interface CompanyDeliveriesCardProps {
  deals: Project[];
  deliveries: Project[];
  stages: PipelineStage[] | undefined;
  canCreate: boolean;
  internalCount: number;
}

export function CompanyDeliveriesCard({
  deals, deliveries, stages, canCreate, internalCount,
}: CompanyDeliveriesCardProps) {
  const router = useRouter();
  const [spawnDeal, setSpawnDeal] = useState<Project | null>(null);

  // Won-сделки без дочернего внедрения. `parent_deal_id` ищем среди внедрений
  // ЭТОЙ компании: внедрение по определению висит на той же компании, что сделка.
  const orphanWon = canCreate
    ? deals.filter((d) => d.status === 'won' && !deliveries.some((dl) => dl.parent_deal_id === d.id))
    : [];

  // Секции нет вовсе, когда нечего показать: пустой блок на каждой второй
  // карточке — шум (то же правило, что действовало до пересборки).
  if (deliveries.length === 0 && orphanWon.length === 0) return null;

  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Rocket size={14} className="text-text-dim" />
        {/* Заголовок называет ровно то, что перечисляет список: `internal` живёт
            здесь по контракту `splitCompanyProjects`. */}
        <span className="text-xs font-semibold text-text-main">
          {internalCount > 0 ? 'Внедрения и внутренние' : 'Внедрения'}
        </span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{deliveries.length}</span>
      </div>

      <div className="space-y-1.5">
        {deliveries.map((p) => {
          const stage = p.stage_id ? stages?.find((s) => s.id === p.stage_id) : undefined;
          const stageName = stage?.name ?? '—';
          // Health — из project-level полей строки; isTerminal из стадии+статуса
          // (дословно как в DealDeliveryHub/PortfolioView — пороги не форкаем).
          const health = getDeliveryHealth({
            progress_done: p.progress_done,
            progress_total: p.progress_total,
            stage_entered_at: p.stage_entered_at,
            deadline: p.deadline,
            updated_at: p.updated_at,
            isTerminal: isDeliveryTerminal(stage, p.status),
          });
          return (
            <button key={p.id} onClick={() => router.push(projectHref(p))}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
              <DeliveryHealthDot health={health} />
              <span className="truncate text-sm text-text-main">{p.name}</span>
              {/* Внутренний проект (stage_id=null, вне воронки) — называем вещи
                  своими именами, чтобы секция не выдавала его за внедрение. */}
              {p.type === 'internal' ? (
                <span data-tag className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
                  Внутренний
                </span>
              ) : (
                <span data-tag className="shrink-0 rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent">
                  {stageName}
                </span>
              )}
              <ProgressBar done={p.progress_done} total={p.progress_total} />
              {p.deadline && (
                <span className="ml-auto shrink-0 text-xs tabular-nums text-text-dim" title={`Дедлайн: ${p.deadline}`}>
                  {formatDateShort(p.deadline)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── CTA «Запустить внедрение» ───
          Рендерится только при `canCreate`: viewer получил бы кнопку, которая
          гарантированно упирается в RLS 42501. */}
      {orphanWon.slice(0, CTA_LIMIT).map((d) => (
        <div key={d.id}
          className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border2 px-3 py-2">
          <PlusCircle size={13} className="shrink-0 text-text-mute" />
          <span className="min-w-0 text-xs text-text-dim">
            По сделке «<span className="text-text-main">{d.name}</span>» (won) внедрение не запущено
          </span>
          <button
            onClick={() => setSpawnDeal(d)}
            className="ml-auto shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-text-main transition-colors hover:bg-surface-hover"
          >
            Запустить внедрение
          </button>
        </div>
      ))}
      {orphanWon.length > CTA_LIMIT && (
        <p className="mt-1.5 px-3 text-xs text-text-mute">
          + ещё {orphanWon.length - CTA_LIMIT} без внедрения
        </p>
      )}

      {spawnDeal && (
        <SpawnWizard
          dealId={spawnDeal.id}
          dealDirection={spawnDeal.direction}
          defaultOwnerId={spawnDeal.owner_id}
          onCreated={(newId) => { setSpawnDeal(null); router.push(`/projects/${newId}`); }}
          onClose={() => setSpawnDeal(null)}
        />
      )}
    </div>
  );
}

/**
 * Прогресс внедрения. Ноль задач на доске — бара нет вовсе: пустой трек читается
 * как «0 % сделано», хотя означает «доску ещё не наполняли».
 */
function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <span
      title={`${done} из ${total} задач`}
      className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-surface3"
      role="img"
      aria-label={`Прогресс: ${done} из ${total} задач`}
    >
      <span className="block h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
    </span>
  );
}
