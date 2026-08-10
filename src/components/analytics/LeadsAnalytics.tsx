'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Target, Percent, Timer, CheckCircle2 } from 'lucide-react';
import { localDateKey } from '@/lib/utils/date-helpers';
import { useLeadsForAnalytics } from '@/lib/hooks/use-leads';
import { aggregateLeadFunnel, LEAD_SOURCE_UNKNOWN } from '@/lib/domain/lead-metrics';
import {
  LEAD_SOURCE_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  type DisqualifyReason,
} from '@/lib/validators/lead';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b: воронка лидов на странице аналитики.
//
// recharts здесь НЕТ намеренно (в отличие от `TasksAnalytics`): всё содержимое —
// таблица и полосы, а `dynamic`-чанк ради двух `<div>` только добавил бы скелетон
// и лишний запрос за чанком.
//
// ⚠️ ПУСТОЕ СОСТОЯНИЕ — ГЛАВНОЕ ТРЕБОВАНИЕ БЛОКА, а не вежливость: на проде сейчас
// ноль конвертированных лидов, и «конверсия 0%» рядом с пустыми таблицами читалась
// бы как поломка. Поэтому пока нет ни одного закрытого лида, блок честно говорит,
// что метрике неоткуда взяться.
// ═══════════════════════════════════════════════════════

/** Дефолт — последние 90 дней: цикл лида короткий, но выборка должна набраться. */
function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return localDateKey(d);
}

function KpiTile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-main tabular-nums">{value}</div>
        <div className="text-xs text-text-dim">{label}</div>
        {sub && <div className="text-xs text-text-mute tabular-nums">{sub}</div>}
      </div>
    </div>
  );
}

/** «4 ч» / «1,5 дн.» — часы до суток читаются часами, дальше сутками. */
function formatHours(h: number | null): string {
  if (h == null) return '—';
  // «0,0 ч» — это не ноль, а «быстрее часа»; ноль в метрике времени выглядит
  // как несчитанное значение (смок на живых данных ровно это и показал).
  if (h < 1) return 'меньше часа';
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace('.', ',') : Math.round(h)} ч`;
  return `${(h / 24).toFixed(1).replace('.', ',')} дн.`;
}

function formatDays(d: number | null): string {
  if (d == null) return '—';
  // «0,0 дн.» на быстрой квалификации читается как ноль-ошибка, а не как «в тот же
  // день»: до суток показываем часами, как и первое касание.
  if (d < 1) return formatHours(d * 24);
  return `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} дн.`;
}

/** Размер выборки рядом с медианой: медиана без него — театр. */
function sampleNote(count: number): string {
  return count === 0 ? 'нет данных' : `по ${count} ${count % 10 === 1 && count % 100 !== 11 ? 'лиду' : 'лидам'}`;
}

function sourceLabel(source: string): string {
  if (source === LEAD_SOURCE_UNKNOWN) return 'Не указан';
  return LEAD_SOURCE_CONFIG[source]?.label ?? source;
}

export function LeadsAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Диапазон в URL — общий с TasksAnalytics параметр `from` (одна страница, одна
  // ось времени; свой ключ развёл бы два блока по разным периодам молча).
  const def = useMemo(defaultFrom, []);
  const from = searchParams.get('from') || def;

  const setFrom = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('from', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const { data: leads = [], isLoading } = useLeadsForAnalytics(`${from}T00:00:00Z`);
  const stats = useMemo(() => aggregateLeadFunnel(leads, []), [leads]);

  const { totals, bySource, byDisqualifyReason, firstTouchHours, qualifyDays } = stats;
  const closed = totals.converted + totals.disqualified;
  const maxReason = Math.max(1, ...byDisqualifyReason.map((r) => r.count));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-main">Лиды</h2>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="text-text-mute">с</span>
          <input
            type="date"
            value={from}
            max={localDateKey()}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-text-main tabular-nums"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl border border-border/50 bg-surface" />
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-surface p-6 text-center text-sm text-text-dim">
          За выбранный период лидов нет.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              icon={Target}
              label="Лидов в работе"
              value={String(totals.active)}
              sub={`всего за период: ${leads.length}`}
              tone="bg-accent-l text-accent"
            />
            <KpiTile
              icon={Percent}
              label="Конверсия"
              value={closed === 0 ? '—' : `${Math.round(totals.conversionRate * 100)}%`}
              sub={closed === 0 ? 'нет закрытых лидов' : `${totals.converted} из ${closed} закрытых`}
              tone="bg-green/10 text-green"
            />
            <KpiTile
              icon={Timer}
              label="До первого касания"
              value={formatHours(firstTouchHours.median)}
              sub={sampleNote(firstTouchHours.count)}
              tone="bg-blue/10 text-blue"
            />
            <KpiTile
              icon={CheckCircle2}
              label="До квалификации"
              value={formatDays(qualifyDays.median)}
              sub={sampleNote(qualifyDays.count)}
              tone="bg-yellow/10 text-yellow"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* Источники */}
            <div className="rounded-xl border border-border/50 bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-mute">
                Источники
              </h3>
              {bySource.length === 0 ? (
                <p className="text-sm text-text-mute">Нет данных</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-mute">
                      <th className="pb-1 text-left font-normal">Источник</th>
                      <th className="pb-1 text-right font-normal">Всего</th>
                      <th className="pb-1 text-right font-normal">Конв.</th>
                      <th className="pb-1 text-right font-normal">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((r) => (
                      <tr key={r.source} className="border-t border-border/40">
                        <td className="py-1.5 text-text-main">{sourceLabel(r.source)}</td>
                        <td className="py-1.5 text-right tabular-nums text-text-dim">{r.total}</td>
                        <td className="py-1.5 text-right tabular-nums text-text-dim">{r.converted}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-text-main">
                          {r.converted === 0 ? '—' : `${Math.round(r.rate * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Причины отказов */}
            <div className="rounded-xl border border-border/50 bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-mute">
                Причины отказов
              </h3>
              {byDisqualifyReason.length === 0 ? (
                <p className="text-sm text-text-mute">
                  Отказов за период нет — причины появятся, когда лиды начнут закрываться.
                </p>
              ) : (
                <ul className="space-y-2">
                  {byDisqualifyReason.map((r) => (
                    <li key={r.reason}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-text-main">
                          {DISQUALIFY_REASON_CONFIG[r.reason as DisqualifyReason]?.label ?? r.reason}
                        </span>
                        <span className="tabular-nums text-text-dim">{r.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
                        <div
                          className="h-full rounded-full bg-red"
                          style={{ width: `${Math.round((r.count / maxReason) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {closed === 0 && (
            <p className="text-xs text-text-mute">
              Данных для конверсии пока нет: метрика появится после первых конвертированных
              и дисквалифицированных лидов.
            </p>
          )}
        </>
      )}
    </section>
  );
}
