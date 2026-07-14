'use client';

import Link from 'next/link';
import { Rocket, Plus, ExternalLink, AlertCircle } from 'lucide-react';
import { useChildDeliveries, type ChildDelivery } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { DELIVERY_PHASE_LABELS, deliveryKindLabel } from '@/lib/constants/delivery-phases';

// ═══════════════════════════════════════════════════════
// S-DEAL-HUB-1 — «Внедрения по сделке»: дочерние delivery-проекты
// (parent_deal_id = deal.id) на карточке выигранной сделки. Read-only:
// состояние (фаза СДР из stage_id), прогресс задач, ссылка на 1С:ДО,
// переход в проект + CTA «Создать внедрение». Направление won-сделка →
// delivery; обратный бейдж и health-скор — отдельные спринты.
// ═══════════════════════════════════════════════════════

interface DealDeliveryHubProps {
  dealId: string;
  dealStatus: string;
  /**
   * Переиспользуем spawn-триггер, живущий в ProjectDetail (панель выбора
   * шаблона + RPC spawn_delivery_project). Хаб не дублирует RPC-логику —
   * дёргает существующий триггер. Без колбэка CTA не рендерится.
   */
  onCreateDelivery?: () => void;
}

export function DealDeliveryHub({ dealId, dealStatus, onCreateDelivery }: DealDeliveryHubProps) {
  const isWon = dealStatus === 'won';
  // enabled по dealId — не грузим, пока сделка не выиграна
  const { data: deliveries, isLoading, isError, refetch } = useChildDeliveries(isWon ? dealId : '');
  const { data: stages } = usePipelineStages();

  // Секция релевантна только после выигрыша: внедрения рождаются из won-сделки.
  if (!isWon) return null;

  // Лейбл текущего состояния = phase_group стадии delivery-пайплайна (тот же
  // маппинг, что в ProjectDetail/StackedPipeline — не хардкодим слаги).
  const phaseLabel = (stageId: string | null): string => {
    const st = stages?.find((s) => s.id === stageId);
    const g = st?.phase_group ?? '';
    return DELIVERY_PHASE_LABELS[g] ?? g ?? '—';
  };

  return (
    <section aria-labelledby="deal-delivery-hub-heading" className="mb-6">
      <h2
        id="deal-delivery-hub-heading"
        className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-main"
      >
        <Rocket size={14} className="text-text-dim" /> Внедрения по сделке
      </h2>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-lg border border-border/50 bg-surface2" />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red/30 bg-red/5 px-3 py-2.5 text-sm text-red"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">Не удалось загрузить внедрения</span>
          <button
            onClick={() => refetch()}
            className="rounded border border-red/40 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-red/10"
          >
            Повторить
          </button>
        </div>
      ) : !deliveries || deliveries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-5 text-center">
          <p className="text-sm text-text-dim">Внедрение ещё не создано</p>
          {onCreateDelivery && (
            <button
              onClick={onCreateDelivery}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs
                         font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Rocket size={12} /> Создать внедрение
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => (
            <DeliveryRow key={d.id} delivery={d} phase={phaseLabel(d.stage_id)} />
          ))}
          {/* 1 сделка → 1..N внедрений — CTA остаётся при непустом списке */}
          {onCreateDelivery && (
            <button
              onClick={onCreateDelivery}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs
                         font-medium text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Создать внедрение
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DeliveryRow({ delivery: d, phase }: { delivery: ChildDelivery; phase: string }) {
  const hasProgress = d.progress_total > 0;
  const pct = hasProgress ? Math.round((d.progress_done / d.progress_total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface px-3 py-2.5">
      {/* TODO(S-DLV-HEALTH-1): health badge slot */}

      <div className="min-w-0 flex-1">
        <Link
          href={`/projects/${d.id}`}
          className="block truncate text-sm font-medium text-accent hover:underline"
        >
          {d.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-dim">
          <span>{phase}</span>
          {d.delivery_kind && (
            <>
              <span aria-hidden>·</span>
              <span>{deliveryKindLabel(d.delivery_kind, d.direction)}</span>
            </>
          )}
        </div>
      </div>

      {/* Прогресс задач: бар + N/M; guard на total=0 (не делим на ноль) */}
      <div className="flex w-28 shrink-0 items-center gap-2">
        {hasProgress ? (
          <>
            <div
              role="progressbar"
              aria-valuenow={d.progress_done}
              aria-valuemin={0}
              aria-valuemax={d.progress_total}
              aria-label="Прогресс задач внедрения"
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-text-dim">
              {d.progress_done}/{d.progress_total}
            </span>
          </>
        ) : (
          <span className="ml-auto text-[11px] tabular-nums text-text-mute">—</span>
        )}
      </div>

      {/* Ссылка на проект в 1С:ДО — только если задана */}
      {d.do_url && (
        <a
          href={d.do_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть в 1С:ДО"
          className="shrink-0 rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-accent"
        >
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}
