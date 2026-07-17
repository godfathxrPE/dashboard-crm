'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Rocket } from 'lucide-react';
import { useDeliveryProjects, type Project } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useTeamMembers, type TeamMember } from '@/lib/hooks/use-team-members';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import {
  getDeliveryHealth,
  isDeliveryTerminal,
  type DeliveryHealth,
  type DeliveryHealthStatus,
} from '@/lib/utils/delivery-health';
import {
  DELIVERY_PHASE_ORDER,
  DELIVERY_PHASE_LABELS,
  DELIVERY_PHASE_TEXT,
  deliveryKindLabel,
  hasTaskProgress,
  type DeliveryPhase,
} from '@/lib/constants/delivery-phases';
import { projectHref } from '@/lib/utils/project-href';
import type { PipelineStage } from '@/types/database';

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

type PortfolioRow = {
  id: string; // keyField + top-level ключ для сорта по имени
  name: string; // DataTable сортирует по String(item[key]) — нужен на верхнем уровне
  deadline: string | null; // ISO — сортируется корректно как строка
  project: Project;
  health: DeliveryHealth;
  stageName: string;
  phase: DeliveryPhase | null;
  dwellDays: number | null;
  ownerName: string;
  isTerminal: boolean;
};

function isDeliveryPhase(v: string | null | undefined): v is DeliveryPhase {
  return !!v && (DELIVERY_PHASE_ORDER as readonly string[]).includes(v);
}

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
  const { data: rawProjects, isLoading, error } = useDeliveryProjects();
  const { data: allStages } = usePipelineStages();
  const { data: members } = useTeamMembers();
  const [filter, setFilter] = useState<PortfolioFilter>('all');

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    allStages?.forEach((s) => map.set(s.id, s));
    return map;
  }, [allStages]);

  const membersById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    members?.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  // Активные внедрения, обогащённые health/фазой/dwell, предсортированные по score asc.
  const active = useMemo<PortfolioRow[]>(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const rows: PortfolioRow[] = [];

    for (const p of rawProjects ?? []) {
      if (p.type !== 'delivery') continue;

      const st = p.stage_id ? stageById.get(p.stage_id) ?? null : null;
      const isTerminal = isDeliveryTerminal(st, p.status);
      const health = getDeliveryHealth({
        progress_done: p.progress_done,
        progress_total: p.progress_total,
        stage_entered_at: p.stage_entered_at,
        deadline: p.deadline,
        updated_at: p.updated_at,
        isTerminal,
      });

      // Портфель = активные (в полёте). Терминальные (score 100) не краснят/не считаются.
      if (isTerminal) continue;

      const phaseRaw = st?.phase_group ?? null;
      const dwellMs = p.stage_entered_at ? new Date(p.stage_entered_at).getTime() : null;
      const dwellDays =
        dwellMs !== null && !Number.isNaN(dwellMs)
          ? Math.floor((nowMs - dwellMs) / 86400000)
          : null;

      rows.push({
        id: p.id,
        name: p.name,
        deadline: p.deadline,
        project: p,
        health,
        stageName: st?.name ?? '—',
        phase: isDeliveryPhase(phaseRaw) ? phaseRaw : null,
        dwellDays,
        ownerName: (p.owner_id ? membersById.get(p.owner_id)?.full_name : null) ?? '—',
        isTerminal,
      });
    }

    // Краснее — сверху (дефолтный порядок таблицы: DataTable стартует с sortKey=null).
    rows.sort((a, b) => a.health.score - b.health.score);
    return rows;
  }, [rawProjects, stageById, membersById]);

  // ── Риск-счётчики ──
  const counts = useMemo(() => {
    const c: Record<DeliveryHealthStatus, number> = { at_risk: 0, attention: 0, healthy: 0 };
    for (const r of active) c[r.health.status] += 1;
    return c;
  }, [active]);

  // ── Старение по фазам: кол-во активных + макс. dwell в фазе ──
  const aging = useMemo(() => {
    return DELIVERY_PHASE_ORDER.map((phase) => {
      const inPhase = active.filter((r) => r.phase === phase);
      const maxDwell = inPhase.reduce<number | null>((mx, r) => {
        if (r.dwellDays == null) return mx;
        return mx == null ? r.dwellDays : Math.max(mx, r.dwellDays);
      }, null);
      return { phase, count: inPhase.length, maxDwell };
    });
  }, [active]);

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
          <span className="text-[11px] tabular-nums text-text-mute">{r.health.score}</span>
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
          <Badge color={r.project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
            {r.project.direction === 'iiot' ? 'IIoT' : 'ERP'}
          </Badge>
          {r.project.delivery_kind && (
            <span className="text-[10px] text-text-mute">
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
      render: (r) =>
        r.ownerName === '—' ? (
          <span className="text-text-mute">—</span>
        ) : (
          <span className="text-xs text-text-dim">{r.ownerName}</span>
        ),
    },
    {
      key: 'phase',
      label: 'Состояние',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs text-text-dim">{r.stageName}</span>
          {r.phase && (
            <span
              className="text-[10px] font-medium"
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
            className="block max-w-[220px] truncate text-[11px] text-text-mute"
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
              className="text-[11px] font-medium"
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
              <span className="text-[10px] tabular-nums text-text-mute">
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
