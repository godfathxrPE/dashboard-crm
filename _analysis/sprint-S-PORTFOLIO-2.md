# Claude Code Prompt — S-PORTFOLIO-2: Risk-виджет на /overview

## КОНТЕКСТ (не для исполнения, для понимания)
Закрываем боль роадмапа «руководство не видит красные внедрения до эскалации».
На /overview (DashboardHome) добавляем компактный **Risk-виджет**: «N в зоне риска +
топ-красные» с deep-link в таб «Портфель» (/projects?tab=portfolio).

**Доступ:** виджет для всех ролей (RBAC-гейта НЕТ — RLS уже скоупит данные по организации).

**Три инварианта (нарушение = провал спринта):**
1. **Не форкать пороги health.** Логика ранжирования (`getDeliveryHealth`, сорт по
   `score asc`, исключение терминальных) — одна на всех. Поэтому выносим её из
   `PortfolioView` в общий хук `usePortfolioHealth()`; и `PortfolioView`, и виджет
   потребляют его. Поведение `PortfolioView` обязано остаться идентичным.
2. **Ноль новых типов запросов.** Хук использует только `useDeliveryProjects()` +
   `usePipelineStages()` (оба уже в кэше React Query: stages тянет воронка на /overview).
   `useTeamMembers` в хук НЕ тащим — owner нужен только таблице PortfolioView.
3. **Токены, не hex.** var-токены (`surface`/`text-red/yellow/green/mute/dim/main`),
   `tabular-nums`, CVD-глифы (▲ красный / ◐ жёлтый / ● зелёный). Ноль Tailwind-цветов, ноль px.

---

## РАЗВЕДКА (выполнить ПЕРВЫМ, ничего не менять)
```bash
cd ~/Downloads/dashboard-crm

# 1. Подтвердить сигнатуры переиспользуемого
grep -n "export function useDeliveryProjects\|export function useProjects" src/lib/hooks/use-projects.ts
grep -n "export function usePipelineStages" src/lib/hooks/use-pipelines.ts
grep -n "getDeliveryHealth\|isDeliveryTerminal\|DeliveryHealth\b\|DeliveryHealthStatus" src/lib/utils/delivery-health.ts
grep -n "DELIVERY_PHASE_ORDER\|DELIVERY_PHASE_LABELS\|DELIVERY_PHASE_TEXT\|deliveryKindLabel\|hasTaskProgress\|type DeliveryPhase" src/lib/constants/delivery-phases.ts

# 2. Текущий таб-стейт ProjectsSection (сейчас useState — переносим в URL)
grep -n "useState<SectionTab>\|setTab\|type SectionTab" src/components/projects/ProjectsSection.tsx

# 3. КРИТИЧНО: как /projects/page.tsx рендерит ProjectsSection.
#    useSearchParams() в Next 15 App Router ТРЕБУЕТ Suspense-границу выше по дереву —
#    иначе билд-ошибка "useSearchParams() should be wrapped in a suspense boundary".
cat "src/app/(dashboard)/projects/page.tsx"

# 4. Точка вставки виджета — композиция DashboardHome()
grep -n "export function DashboardHome" src/components/dashboard/DashboardHome.tsx
```

Прочитать целиком перед правками: `src/components/projects/PortfolioView.tsx`,
`src/components/projects/ProjectsSection.tsx`, `src/components/dashboard/DashboardHome.tsx`.

---

## ЗАДАЧА 1 — Общий хук `usePortfolioHealth()`
**WHY:** единый источник ранжирования для PortfolioView и виджета (инвариант 1).
**WHAT:** новый файл `src/lib/hooks/use-portfolio-health.ts`. Переносим сюда `PortfolioRow`
(тип), `isDeliveryPhase`, вычисление `active`/`counts`/`aging` дословно из PortfolioView.
**Owner НЕ считаем в хуке** (остаётся в PortfolioView).

```ts
// src/lib/hooks/use-portfolio-health.ts
'use client';

import { useMemo } from 'react';
import { useDeliveryProjects, type Project } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  getDeliveryHealth,
  isDeliveryTerminal,
  type DeliveryHealth,
  type DeliveryHealthStatus,
} from '@/lib/utils/delivery-health';
import {
  DELIVERY_PHASE_ORDER,
  type DeliveryPhase,
} from '@/lib/constants/delivery-phases';
import type { PipelineStage } from '@/types/database';

// Строка портфеля БЕЗ ownerName — owner маппит PortfolioView (виджету не нужен).
export type PortfolioRow = {
  id: string;
  name: string;
  deadline: string | null;
  project: Project;
  health: DeliveryHealth;
  stageName: string;
  phase: DeliveryPhase | null;
  dwellDays: number | null;
  isTerminal: boolean;
};

export type PortfolioAging = {
  phase: DeliveryPhase;
  count: number;
  maxDwell: number | null;
};

function isDeliveryPhase(v: string | null | undefined): v is DeliveryPhase {
  return !!v && (DELIVERY_PHASE_ORDER as readonly string[]).includes(v);
}

/**
 * Единый источник health-ранжирования портфеля внедрений.
 * Строки предсортированы по score asc (краснее — выше) — как в S-PORTFOLIO-1.
 * Терминальные (завершён/закрыт) исключены (не краснят портфель).
 */
export function usePortfolioHealth() {
  const { data: rawProjects, isLoading, error } = useDeliveryProjects();
  const { data: allStages } = usePipelineStages();

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    allStages?.forEach((s) => map.set(s.id, s));
    return map;
  }, [allStages]);

  const rows = useMemo<PortfolioRow[]>(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const out: PortfolioRow[] = [];

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

      if (isTerminal) continue; // портфель = активные (в полёте)

      const phaseRaw = st?.phase_group ?? null;
      const dwellMs = p.stage_entered_at ? new Date(p.stage_entered_at).getTime() : null;
      const dwellDays =
        dwellMs !== null && !Number.isNaN(dwellMs)
          ? Math.floor((nowMs - dwellMs) / 86400000)
          : null;

      out.push({
        id: p.id,
        name: p.name,
        deadline: p.deadline,
        project: p,
        health,
        stageName: st?.name ?? '—',
        phase: isDeliveryPhase(phaseRaw) ? phaseRaw : null,
        dwellDays,
        isTerminal,
      });
    }

    out.sort((a, b) => a.health.score - b.health.score); // краснее — сверху
    return out;
  }, [rawProjects, stageById]);

  const counts = useMemo(() => {
    const c: Record<DeliveryHealthStatus, number> = { at_risk: 0, attention: 0, healthy: 0 };
    for (const r of rows) c[r.health.status] += 1;
    return c;
  }, [rows]);

  const aging = useMemo<PortfolioAging[]>(() => {
    return DELIVERY_PHASE_ORDER.map((phase) => {
      const inPhase = rows.filter((r) => r.phase === phase);
      const maxDwell = inPhase.reduce<number | null>((mx, r) => {
        if (r.dwellDays == null) return mx;
        return mx == null ? r.dwellDays : Math.max(mx, r.dwellDays);
      }, null);
      return { phase, count: inPhase.length, maxDwell };
    });
  }, [rows]);

  return { rows, counts, aging, isLoading, error };
}
```
**Verify:** `npx tsc --noEmit` — ноль ошибок в новом файле.

---

## ЗАДАЧА 2 — Рефактор `PortfolioView` на хук (поведение идентично)
**WHY:** убрать дубль логики; PortfolioView — потребитель хука + owner-маппинг.
**WHAT:** в `src/components/projects/PortfolioView.tsx`:
- Удалить локальные memo `active`, `counts`, `aging` и хуки `useDeliveryProjects`,
  `usePipelineStages` (переехали в хук). Импортировать `usePortfolioHealth`, `PortfolioRow`.
- Оставить `useTeamMembers()` + `membersById` — owner маппится в колонке (было поле
  `ownerName` в строке, теперь берём `membersById.get(r.project.owner_id)?.full_name ?? '—'`).
- `filter`-стейт, `filteredRows`, `columns`, `RiskChip`, segmented, `DataTable` — без изменений.
- `PortfolioRow` больше не объявлять локально — импорт из хука.

```
// было
const { data: rawProjects, isLoading, error } = useDeliveryProjects();
const { data: allStages } = usePipelineStages();
// ...весь блок active/counts/aging...

// стало
const { rows: active, counts, aging, isLoading, error } = usePortfolioHealth();
const { data: members } = useTeamMembers();
// membersById оставить; в колонке owner:
//   const ownerName = (r.project.owner_id ? membersById.get(r.project.owner_id)?.full_name : null) ?? '—';
```
**Verify:** визуально PortfolioView в /projects → таб «Портфель» рендерит так же
(чипы-счётчики, старение, segmented-фильтр, красное-сверху). `npx tsc --noEmit` чисто.

---

## ЗАДАЧА 3 — Таб «Портфель» в URL (`?tab=portfolio`) + Suspense
**WHY:** deep-link из виджета невозможен, пока таб в `useState`. Плюс конвенция
crm-architect: active tabs → searchParams (share-able).
**WHAT (3a):** `src/components/projects/ProjectsSection.tsx` — таб из URL:
```tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
// ...
const TABS: readonly SectionTab[] = ['delivery', 'portfolio', 'internal'];

export function ProjectsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: SectionTab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as SectionTab)
    : 'delivery';

  const setTab = (value: SectionTab) => {
    const qs = value === 'delivery' ? '' : `?tab=${value}`; // дефолт — чистый URL
    router.replace(`${pathname}${qs}`, { scroll: false });
  };
  // разметка табов без изменений: onClick={() => setTab(t.value)}, активность tab === t.value
}
```
**WHAT (3b) — КРИТИЧНО:** `useSearchParams()` требует Suspense. В
`src/app/(dashboard)/projects/page.tsx` обернуть `<ProjectsSection />` в `<Suspense>`
(если ещё не обёрнут). Fallback — лёгкий спиннер в тон DataTable:
```tsx
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
// ...
<Suspense fallback={
  <div className="flex h-48 items-center justify-center">
    <Loader2 size={24} className="animate-spin text-accent" />
  </div>
}>
  <ProjectsSection />
</Suspense>
```
**Verify:** `npm run build` проходит без "useSearchParams should be wrapped in a
suspense boundary". Клик по табам меняет URL (`/projects` ↔ `/projects?tab=portfolio` ↔
`?tab=internal`); прямой заход на `/projects?tab=portfolio` открывает нужный таб;
кнопка «назад» переключает таб.

---

## ЗАДАЧА 4 — Компонент `PortfolioRiskWidget`
**WHY:** management-сигнал на домашней. **WHAT:** новый
`src/components/dashboard/PortfolioRiskWidget.tsx`. Данные — `usePortfolioHealth()`.
Красный фокус: заголовок = `counts.at_risk`, ниже топ-N красных (уже отсортированы
`score asc`), вторичной строкой — `counts.attention` (внимание). Zero-state (0 в риске) —
спокойный зелёный, НЕ прятать (без прыжка лейаута). Клик по строке → `projectHref` (деталка),
футер-ссылка → `/projects?tab=portfolio`.

```tsx
'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { usePortfolioHealth } from '@/lib/hooks/use-portfolio-health';
import { projectHref } from '@/lib/utils/project-href';

const TOP_N = 4;

export function PortfolioRiskWidget() {
  const { rows, counts, isLoading, error } = usePortfolioHealth();

  if (isLoading) {
    return (
      <div className="rounded-lg bg-surface p-4 elevation-hover">
        <div className="flex h-24 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-accent" />
        </div>
      </div>
    );
  }
  if (error) return null; // тихо: остальной дашборд не ломаем

  const redRows = rows.filter((r) => r.health.status === 'at_risk').slice(0, TOP_N);
  const hasRisk = counts.at_risk > 0;

  return (
    <div className="rounded-lg bg-surface p-4 elevation-hover">
      {/* Заголовок */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className={hasRisk ? 'text-red' : 'text-green'}>
            {hasRisk ? '▲' : '●'}
          </span>
          <span className="text-xs font-semibold text-text-dim">
            {hasRisk ? 'Внедрения в зоне риска' : 'Портфель внедрений'}
          </span>
        </div>
        <Link
          href="/projects?tab=portfolio"
          className="flex items-center gap-1 text-[11px] text-accent hover:underline"
        >
          Портфель <ArrowRight size={12} />
        </Link>
      </div>

      {/* Счётчики */}
      <div className="mb-3 flex items-baseline gap-3">
        <span className={`text-3xl font-bold tabular-nums ${hasRisk ? 'text-red' : 'text-green'}`}>
          {counts.at_risk}
        </span>
        <span className="text-xs text-text-mute">
          в риске
          {counts.attention > 0 && (
            <> · <span className="text-yellow">◐</span> {counts.attention} внимание</>
          )}
        </span>
      </div>

      {/* Топ-красные или спокойное zero-state */}
      {hasRisk ? (
        <div className="space-y-1">
          {redRows.map((r) => (
            <Link
              key={r.id}
              href={projectHref(r.project)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover"
            >
              <AlertTriangle size={12} className="shrink-0 text-red" />
              <span className="min-w-0 flex-1 truncate text-xs text-text-main">
                {r.project.name}
              </span>
              {r.health.reasons[0] && (
                <span className="hidden shrink-0 text-[10px] text-text-mute sm:inline">
                  {r.health.reasons[0]}
                </span>
              )}
              <span className="shrink-0 text-[11px] tabular-nums text-text-mute">
                {r.health.score}
              </span>
            </Link>
          ))}
          {counts.at_risk > TOP_N && (
            <Link
              href="/projects?tab=portfolio"
              className="block px-2 pt-1 text-[11px] text-accent hover:underline"
            >
              ещё {counts.at_risk - TOP_N} →
            </Link>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-mute">
          Нет активных внедрений в риске — всё зелёное.
        </p>
      )}
    </div>
  );
}
```
**Verify:** типизация чистая; ноль hex; глифы ▲/◐/● совпадают с PortfolioView (CVD-safe).

---

## ЗАДАЧА 5 — Вставить виджет в композицию DashboardHome
**WHY:** место — сразу под KPI, до графиков (management видит красное первым).
**WHAT:** в `src/components/dashboard/DashboardHome.tsx`:
- Импорт: `import { PortfolioRiskWidget } from './PortfolioRiskWidget';`
- В `DashboardHome()` вставить строку между `<KpiCards />` и блоком графиков:
```tsx
{/* Row 1: KPI cards */}
<KpiCards />

{/* Row 1.5: Portfolio risk (management-сигнал) */}
<div className="animate-appear stagger-5">
  <PortfolioRiskWidget />
</div>

{/* Row 2: Charts */}
```
**Verify:** /overview рендерит виджет под KPI; консоль чистая; 6 тем — цвета из токенов.

---

## ЗАДАЧА 6 — Nit S-PORTFOLIO-1 (direction-бейдж)
**WHY:** сейчас бейдж в PortfolioView рисуется всегда → у delivery с `direction=null`
покажет ложный синий «ERP».
**WHAT:** в колонке «Проект» PortfolioView обернуть Badge в guard:
```tsx
{r.project.direction && (
  <Badge color={r.project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
    {r.project.direction === 'iiot' ? 'IIoT' : 'ERP'}
  </Badge>
)}
```
**Verify:** delivery без direction — без бейджа.

---

## EDGE CASES (проверить руками/смоком)
- Портфель пуст (нет активных delivery) → виджет зелёный «всё зелёное», ссылка живёт.
- Все внедрения healthy → счётчик 0, зелёный, без списка.
- >TOP_N красных → строка «ещё N →».
- Loading → скелетон; error → виджет молча пропадает, дашборд цел.
- Прямой заход `/projects?tab=portfolio` и кнопка «назад».

## SELF-CHECK перед коммитом
- [ ] `npx tsc --noEmit` — 0 ошибок; ни одного `any`.
- [ ] `npm run build` — проходит (Suspense вокруг useSearchParams).
- [ ] PortfolioView визуально идентичен до/после (backward-compat).
- [ ] Ноль hex, ноль px (кроме border ≤2px), var-токены, `tabular-nums`.
- [ ] Никаких новых Supabase-запросов/миграций (read-only reuse).

## КОММИТ
```bash
git add .
git commit -m "feat(portfolio): S-PORTFOLIO-2 — risk-виджет на /overview (общий usePortfolioHealth, таб-URL, deep-link)"
```
НЕ пушить без явного «пушь» (пуш в main = деплой прод).

---

## VERIFICATION LABELS (заполнит CC/гейт)
```
Type Safety:            NOT_VERIFIED (до tsc на живой ФС)
RLS Coverage:           NOT_APPLICABLE (read-only, без новых таблиц/запросов)
Backward Compatibility: NOT_VERIFIED (PortfolioView-рефактор — проверить смоком таба)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```
