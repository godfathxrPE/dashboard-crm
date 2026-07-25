# Claude Code Prompt — S-PORTFOLIO-1: Портфель внедрений (таб в /projects)

> Management-вид: список активных внедрений, ранжированный по **health-score** (краснее — выше), счётчики риска, старение по фазам. Закрывает боль роадмапа «Руководство не видит красные проекты до эскалации». **Чистый /code, D2. БД НЕ трогаем, миграций НЕТ, новых запросов НЕТ** — переиспользуем `getDeliveryHealth` + существующие хуки. Стек: Next 15 + TS strict + Tailwind (6 тем).
>
> **Разведка выполнена (Cowork), реальные факты кода (HEAD 91fd2a0):**
> - `lib/utils/delivery-health.ts` — `getDeliveryHealth(p, now?) → { status:'healthy'|'attention'|'at_risk', reasons:string[], score:0..100 }`; вход `{ progress_done, progress_total, stage_entered_at, deadline, updated_at, isTerminal }`. `isDeliveryTerminal(stage|null, status?) → boolean` (терминал = `completed`/`lost` ИЛИ `is_won`/`is_lost`/`phase_group==='completed'`). Терминал → всегда score 100 healthy.
> - `hooks/use-projects.ts` — `useDeliveryProjects()` (delivery+internal, realtime, staleTime 60s). `Project` содержит: `id, name, company?{id,name}, owner_id, deadline, stage_id, status, type, stage_entered_at, updated_at, progress_done, progress_total, direction, delivery_kind`.
> - `hooks/use-pipelines.ts` — `usePipelineStages()` → `PipelineStage[]` (у `DeliveryPipelineBoard` уже так строится `stageById`); `PipelineStage` имеет `id, name, phase_group, is_won, is_lost, pipeline_id`.
> - `hooks/use-team-members.ts` — `useTeamMembers()` → `TeamMember[] { id, full_name, avatar_url, role }` (org-scope RLS, staleTime 5м, тёплый кеш — уже тянет AssigneeSelect). Для owner-колонки.
> - `constants/delivery-phases.ts` — `DELIVERY_PHASE_ORDER = ['initiated','planning','execution','completed']`, `DELIVERY_PHASE_LABELS`, `DELIVERY_PHASE_TEXT` (text-совместимые var-токены), `hasTaskProgress(total)`.
> - `components/shared/DeliveryHealthDot.tsx` — `<DeliveryHealthDot health size?='sm'|'md' showLabel? />`; глиф+цвет (CVD-safe: ● норма / ◐ внимание / ▲ риск), zero hex, `aria-label` с причинами.
> - `components/shared/DataTable.tsx` — `<DataTable data columns keyField onRowClick? pageSize? searchPlaceholder? emptyMessage? emptyIcon? />`. `Column<T> { key, label, sortable?, width?, render, searchValue? }`. **ВАЖНО: сорт внутри — строковый (`String(item[key])`), стартовый `sortKey=null` → отдаёт данные в исходном порядке.** Числовой score строкой сортируется неверно → **score/dwell колонки НЕ `sortable`; массив предсортируем сами по score asc.**
> - `utils/project-href.ts` — `projectHref({id,type}) → '/projects/[id]'` для delivery. `components/projects/ProjectsSection.tsx` — табы (`SectionTab='delivery'|'internal'`, кнопки + ветка рендера); сюда добавляем 3-й таб.
> - Референс связки health: `DeliveryPipelineBoard.tsx` `healthOf(p)` — копируем ту же логику 1-в-1.

## ЗАДАЧА 1 — новый компонент `src/components/projects/PortfolioView.tsx`

`'use client'`. Данные — три существующих хука, **ноль новых запросов**:
```ts
const { data: rawProjects, isLoading, error } = useDeliveryProjects();
const { data: allStages } = usePipelineStages();
const { data: members } = useTeamMembers();
```

**Enrich (useMemo)** — только `type==='delivery'` (как на доске), считаем health и обогащаем:
```ts
type PortfolioRow = {
  project: Project;
  health: DeliveryHealth;      // getDeliveryHealth(...)
  stageName: string;           // stageById.get(stage_id)?.name ?? '—'
  phase: DeliveryPhase | null; // stageById.get(stage_id)?.phase_group (если в ORDER)
  dwellDays: number | null;    // floor((now - stage_entered_at)/86400000)
  ownerName: string;           // membersById.get(owner_id)?.full_name ?? '—'
  isTerminal: boolean;         // isDeliveryTerminal(stage, status)
};
```
- `stageById: Map<string,PipelineStage>` и `membersById: Map<string,TeamMember>` — useMemo.
- health-вход **дословно** как в `DeliveryPipelineBoard.healthOf`: `{ progress_done, progress_total, stage_entered_at, deadline, updated_at, isTerminal: isDeliveryTerminal(st, p.status) }`.
- **Портфель = активные внедрения**: `rows.filter(r => !r.isTerminal)`. Терминальные (завершён/проигран) в риск-ранжирование/счётчики НЕ входят (они score 100 и уже не «в полёте»).
- **Предсортировка**: `active.sort((a,b) => a.health.score - b.health.score)` — краснее сверху (это дефолтный порядок таблицы, т.к. DataTable `sortKey=null`).

**Секция A — риск-счётчики (чипы, кликабельные → фильтр).** Над активными:
- «▲ N в риске» (`text-red`), «◐ M внимание» (`text-yellow`), «● K в норме` (`text-green`). Глифы те же, что в DeliveryHealthDot (CVD-safe). `tabular-nums`. Клик по чипу выставляет `filter` (см. Секция C). Активный чип — визуально выделен (ring/фон-токен).

**Секция B — старение по фазам (aging-strip).** Ряд карточек по `DELIVERY_PHASE_ORDER` (4 фазы): для каждой — кол-во активных проектов в фазе + **макс. dwell** (дней) среди них (бутылочное горло видно по «залёживанию»). Лейбл фазы — `DELIVERY_PHASE_LABELS`, цвет текста — `DELIVERY_PHASE_TEXT[phase]`. `tabular-nums`. Пустая фаза — «0», приглушённо. Горизонтальный скролл на узких экранах.

**Секция C — фильтр (segmented) + таблица.**
- Segmented control: `Все` / `▲ Риск` / `◐ Внимание` / `● Норма` — client-state `filter: 'all'|'at_risk'|'attention'|'healthy'`, синхронизирован с кликом по чипам (Секция A). Фильтрует `active` по `health.status`.
- `<DataTable data={filteredRows} keyField="id" onRowClick={r => router.push(projectHref(r.project))} ...>`. `keyField` — вынести `id` наверх строки (напр. строки таблицы = `{ id: project.id, ...PortfolioRow }`), либо `keyField="project"` не годится → добавить `id` в row.
- **Колонки:**
  1. `health` (label «Здоровье», не sortable): `<DeliveryHealthDot health={r.health} />` + `score` (`text-mute tabular-nums text-[11px]`).
  2. `name` (label «Проект», sortable, `searchValue: r => r.project.name`): `font-medium text-text-main`, `deliveryKindLabel`/direction-бейдж опц.
  3. `company` (label «Компания», searchValue name): `r.project.company?.name ?? '—'`.
  4. `owner` (label «Ответственный»): `r.ownerName`.
  5. `phase` (label «Состояние»): `r.stageName` + мелкий лейбл фазы цветом `DELIVERY_PHASE_TEXT`.
  6. `progress` (label «Прогресс»): `hasTaskProgress(total) ? \`${done}/${total}\` (+ % ) : '—'`, `tabular-nums`.
  7. `deadline` (label «Дедлайн», sortable — ISO строка сортируется корректно): дата `ru-RU`; **красный текст если просрочен и прогресс < 100%** (иначе `text-dim`); нет — «—».
  8. `reasons` (label «Причины»): `r.health.reasons` — мелкие чипы или `join('; ')`, truncate `max-w-[220px]`. Это actionable-часть (почему красный).
  9. `dwell` (label «В состоянии», не sortable): `r.dwellDays != null ? \`${r.dwellDays} дн\` : '—'`, `tabular-nums text-mute`; подсветить `text-yellow` если `> 30` (порог застоя STALE_STAGE_DAYS).
- `emptyMessage`: если активных нет вообще — «Нет активных внедрений»; если отфильтровано в ноль — «Нет внедрений в этой категории». `emptyIcon`: `<Rocket/>`.

**Состояния:** loading — `<Loader2 className="animate-spin text-accent"/>` центр (как в ProjectsSection); error — красная панель `border-red/30 bg-red/5` «Ошибка загрузки портфеля».

## ЗАДАЧА 2 — таб в `src/components/projects/ProjectsSection.tsx`
- `type SectionTab = 'delivery' | 'internal' | 'portfolio';`
- В массив табов добавить `{ value: 'portfolio', label: 'Портфель' }` — **первым** (management-вид — точка входа) или после «Внедрение» (на твой вкус по UX; рекомендую после «Внедрение»).
- Ветка рендера: `tab === 'portfolio' ? <PortfolioView /> : tab === 'delivery' ? <DeliveryPipelineBoard /> : <InternalProjectsList />`.

## EDGE CASES (обязательно)
- `progress_total === 0` → `getDeliveryHealth` уже guard'ит (без /0); ячейка прогресса «—».
- `stage_id` не в `stageById` (стадия грузится/unknown) → `phase=null`, `stageName='—'`, `isTerminal=false` (health всё равно считается) — **строку не терять**.
- `owner_id === null` → «—».
- Нет delivery-проектов / все терминальны → пустое состояние, счётчики 0.
- `members`/`allStages` ещё `undefined` (грузятся) → пустые Map, деградация без краша.

## ЖЁСТКО НЕ ТРОГАТЬ
- БД/миграции/RLS — read-only поверх уже видимых по RLS `projects`.
- `getDeliveryHealth`/`isDeliveryTerminal`/`DeliveryHealthDot` — переиспользуй, не форкай пороги.
- `DeliveryPipelineBoard`/`InternalProjectsList` — не рефактори (только +1 ветка таба в ProjectsSection).
- Zero hex: только токены (`text-red/yellow/green`, `text-mute/dim/main`, `DELIVERY_PHASE_TEXT` var'ы, `border`/`bg` токены). `tabular-nums` на всех числах.
- `any` запрещён (`Project`, `PipelineStage`, `DeliveryHealth`, `TeamMember` типизированы). Новых npm-зависимостей нет.
- RBAC-гейтинг вида — вне скоупа v1 (любой член org, видящий /projects, видит портфель). Гейт под manager/admin — backlog (S-PORTFOLIO-2).

## ГЕЙТЫ CC
```bash
npx tsc --noEmit && npm run build      # без any; build при живом dev → изолированный distDir
git diff --stat                        # ровно 2 файла: PortfolioView.tsx (new), ProjectsSection.tsx
```
Локально: `/projects` → таб «Портфель» → (1) чипы-счётчики совпадают с числом строк по статусам; (2) aging-strip: 4 фазы, счётчики+макс dwell; (3) таблица — красные сверху (score asc); (4) клик по чипу «Риск» фильтрует; (5) клик по строке → `/projects/[id]`; (6) просроченный дедлайн красный; (7) 6 тем — читаемо, глифы различимы; (8) консоль чистая.

## КОММИТ
```bash
git add src/components/projects/PortfolioView.tsx src/components/projects/ProjectsSection.tsx
git commit -m "feat(portfolio): S-PORTFOLIO-1 — портфель внедрений (health-ранжирование, риск-счётчики, старение по фазам)"
```

## ПОСЛЕ ТЕБЯ — Cowork
Chrome-смок на проде: таб «Портфель» рендерится, ранжирование краснее-сверху, счётчики = строки, фильтр, aging-strip, клик→detail, 6 тем (скрины), консоль. Затем — фиксация в crm-architect skill (sync-doc).

## VERIFICATION
```
Type Safety:            NOT_VERIFIED (Project/PipelineStage/DeliveryHealth/TeamMember типизированы; подтвердить tsc, без any)
RLS Coverage:           PASS (read-only; наследует projects RLS; новых таблиц/политик нет)
Backward Compatibility: PASS (новый компонент + аддитивный таб; существующие ветки не тронуты)
Runtime Tested:         NOT_VERIFIED (Chrome-смок Cowork)
Design tokens:          PASS (CSS-var токены, примитивы проекта, CVD-safe глифы, tabular-nums)
Regional Availability:  NOT_APPLICABLE (без сторонних сервисов)
```
