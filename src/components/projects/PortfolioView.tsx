'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Rocket } from 'lucide-react';
import { type Project } from '@/lib/hooks/use-projects';
import { useTeamMembers, type TeamMember } from '@/lib/hooks/use-team-members';
import { usePortfolioHealth, type PortfolioRow } from '@/lib/hooks/use-portfolio-health';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { type DeliveryHealthStatus } from '@/lib/utils/delivery-health';
import {
  DELIVERY_PHASE_LABELS,
  DELIVERY_PHASE_TEXT,
  deliveryKindLabel,
  hasTaskProgress,
} from '@/lib/constants/delivery-phases';
import { projectHref } from '@/lib/utils/project-href';

// ═══════════════════════════════════════════════════════
// S-PORTFOLIO-1 — портфель внедрений (management-вид).
// Список активных внедрений, ранжированный по health-score (краснее — выше),
// риск-счётчики и старение по фазам. Ноль новых запросов: три существующих
// хука (useDeliveryProjects + usePipelineStages + useTeamMembers). Health —
// дословно как DeliveryPipelineBoard.healthOf (не форкаем пороги).
// ═══════════════════════════════════════════════════════

const STALE_STAGE_DAYS = 30; // порог застоя (зеркало delivery-health.ts)

// Глифы/цвета — те же, что в DeliveryHealthDot (CVD-safe: форма + цвет).
const STATUS_META: Record<
  DeliveryHealthStatus,
  { glyph: string; text: string; label: string }
> = {
  at_risk: { glyph: '▲', text: 'text-red', label: 'в риске' },
  attention: { glyph: '◐', text: 'text-yellow', label: 'внимание' },
  healthy: { glyph: '●', text: 'text-green', label: 'в норме' },
};

type PortfolioFilter = 'all' | DeliveryHealthStatus;

/** Просрочен и не завершён (прогресс < 100%) — для красной подсветки дедлайна. */
function isOverdueIncomplete(p: Project, now: Date): boolean {
  if (!p.deadline) return false;
  const dl = new Date(p.deadline).getTime();
  if (Number.isNaN(dl)) return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const complete = p.progress_total > 0 && p.progress_done >= p.progress_total;
  return dl < todayStart && !complete;
}

export function PortfolioView() {
  const router = useRouter();
  const { rows: active, counts, aging, isLoading, error } = usePortfolioHealth();
  const { data: members } = useTeamMembers();
  const [filter, setFilter] = useState<PortfolioFilter>('all');

  const membersById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    members?.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const filteredRows = useMemo(
    () => (filter === 'all' ? active : active.filter((r) => r.health.status === filter)),
    [active, filter],
  );

  const now = useMemo(() => new Date(), []);

  const columns: Column<PortfolioRow>[] = [
    {
      key: 'health',
      label: 'Здоровье',
      width: '90px',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <DeliveryHealthDot health={r.health} />
          <span className="text-meta tabular-nums text-text-mute">{r.health.score}</span>
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Проект',
      sortable: true,
      searchValue: (r) => r.project.name,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-text-main">{r.project.name}</span>
          {r.project.direction && (
            <Badge color={r.project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
              {r.project.direction === 'iiot' ? 'IIoT' : 'ERP'}
            </Badge>
          )}
          {r.project.delivery_kind && (
            <span className="text-xs text-text-mute">
              {deliveryKindLabel(r.project.delivery_kind, r.project.direction)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Компания',
      searchValue: (r) => r.project.company?.name ?? '',
      render: (r) =>
        r.project.company?.name ? (
          <span className="text-xs text-text-dim">{r.project.company.name}</span>
        ) : (
          <span className="text-text-mute">—</span>
        ),
    },
    {
      key: 'owner',
      label: 'Ответственный',
      render: (r) => {
        const ownerName =
          (r.project.owner_id ? membersById.get(r.project.owner_id)?.full_name : null) ?? '—';
        return ownerName === '—' ? (
          <span className="text-text-mute">—</span>
        ) : (
          <span className="text-xs text-text-dim">{ownerName}</span>
        );
      },
    },
    {
      key: 'phase',
      label: 'Состояние',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs text-text-dim">{r.stageName}</span>
          {r.phase && (
            <span
              className="text-xs font-medium"
              style={{ color: DELIVERY_PHASE_TEXT[r.phase] ?? 'var(--text-mute)' }}
            >
              {DELIVERY_PHASE_LABELS[r.phase]}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'progress',
      label: 'Прогресс',
      render: (r) => {
        const { progress_done: done, progress_total: total } = r.project;
        if (!hasTaskProgress(total)) return <span className="text-text-mute">—</span>;
        const pct = Math.round((done / total) * 100);
        return (
          <span className="text-xs tabular-nums text-text-dim">
            {done}/{total} <span className="text-text-mute">· {pct}%</span>
          </span>
        );
      },
    },
    {
      key: 'deadline',
      label: 'Дедлайн',
      sortable: true,
      render: (r) => {
        if (!r.project.deadline) return <span className="text-text-mute">—</span>;
        const overdue = isOverdueIncomplete(r.project, now);
        return (
          <span className={`text-xs tabular-nums ${overdue ? 'text-red' : 'text-text-dim'}`}>
            {new Date(r.project.deadline).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        );
      },
    },
    {
      key: 'reasons',
      label: 'Причины',
      render: (r) =>
        r.health.reasons.length ? (
          <span
            className="block max-w-[220px] truncate text-meta text-text-mute"
            title={r.health.reasons.join('; ')}
          >
            {r.health.reasons.join('; ')}
          </span>
        ) : (
          <span className="text-text-mute">—</span>
        ),
    },
    {
      key: 'dwell',
      label: 'В состоянии',
      render: (r) =>
        r.dwellDays != null ? (
          <span
            className={`text-xs tabular-nums ${
              r.dwellDays > STALE_STAGE_DAYS ? 'text-yellow' : 'text-text-mute'
            }`}
          >
            {r.dwellDays} дн
          </span>
        ) : (
          <span className="text-text-mute">—</span>
        ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки портфеля</p>
      </div>
    );
  }

  const emptyMessage =
    active.length === 0 ? 'Нет активных внедрений' : 'Нет внедрений в этой категории';

  // Чип-счётчик риск-категории (кликом → фильтр; повторный клик → все)
  const RiskChip = ({ status }: { status: DeliveryHealthStatus }) => {
    const m = STATUS_META[status];
    const activeChip = filter === status;
    return (
      <button
        onClick={() => setFilter((f) => (f === status ? 'all' : status))}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
          activeChip
            ? 'border-accent bg-accent-l text-text-main'
            : 'border-border text-text-dim hover:bg-surface-hover'
        }`}
      >
        <span aria-hidden className={`${m.text} leading-none`}>
          {m.glyph}
        </span>
        <span className="tabular-nums font-medium">{counts[status]}</span>
        <span className="text-text-mute">{m.label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Секция A — риск-счётчики */}
      <div className="flex flex-wrap items-center gap-2">
        <RiskChip status="at_risk" />
        <RiskChip status="attention" />
        <RiskChip status="healthy" />
      </div>

      {/* Секция B — старение по фазам */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {aging.map(({ phase, count, maxDwell }) => (
          <div
            key={phase}
            className="min-w-[130px] flex-1 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <div
              className="text-meta font-medium"
              style={{ color: DELIVERY_PHASE_TEXT[phase] ?? 'var(--text-mute)' }}
            >
              {DELIVERY_PHASE_LABELS[phase]}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-lg font-semibold tabular-nums ${
                  count === 0 ? 'text-text-mute' : 'text-text-main'
                }`}
              >
                {count}
              </span>
              <span className="text-xs tabular-nums text-text-mute">
                {maxDwell != null ? `макс ${maxDwell} дн` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Секция C — segmented-фильтр + таблица */}
      <div className="flex flex-wrap gap-1">
        {(
          [
            { value: 'all', label: 'Все', glyph: '', text: '' },
            { value: 'at_risk', label: 'Риск', glyph: '▲', text: 'text-red' },
            { value: 'attention', label: 'Внимание', glyph: '◐', text: 'text-yellow' },
            { value: 'healthy', label: 'Норма', glyph: '●', text: 'text-green' },
          ] as const
        ).map((seg) => (
          <button
            key={seg.value}
            onClick={() => setFilter(seg.value)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === seg.value
                ? 'bg-accent text-white'
                : 'text-text-mute hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            {seg.glyph && (
              <span
                aria-hidden
                className={filter === seg.value ? 'leading-none' : `${seg.text} leading-none`}
              >
                {seg.glyph}
              </span>
            )}
            {seg.label}
          </button>
        ))}
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        keyField="id"
        onRowClick={(r) => router.push(projectHref(r.project))}
        searchPlaceholder="Поиск по проекту или компании..."
        emptyMessage={emptyMessage}
        emptyIcon={<Rocket size={32} className="text-text-mute" />}
      />
    </div>
  );
}
