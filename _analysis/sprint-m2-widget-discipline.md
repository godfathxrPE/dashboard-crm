# Claude Code Prompt — Sprint M2: Widget discipline (все темы)

> Зависимости: по коду от M1 НЕ зависит (тема-агностично). Если M1 (t-minimal)
> ещё не смержен — смок идёт по 6 темам, Minimal проверяется после мержа M1.
>
> v1.1 — учтено ревью Grok 2026-07-19: развод shared-ветки washi/default в KPI (B1),
> задача 6 переведена на AccordionLane + LANE_CONFIG-truth (B2), text-yellow (W2),
> data-tag на company (W3), оба заголовка MiniKpi (W4), AccordionLane в коммит (W5).

Компонентный слой, тема-агностично: анатомия KPI, тихий risk-виджет, бюджет
маркеров, нейтральные заголовки секций. Уникальные фичи тем (aura text-nav+орбы,
washi kanji/scramble/watermarks, fuji indigo+gold) НЕ трогаем — они живут в
CSS-коже тем и theme-ветках компонентов; правим только то, что указано.

Принципы (из дизайн-аудита, согласованы):
1. Анатомия KPI: label (тихий, сверху) → значение (главное) → дельта с базой сравнения.
2. Сигнал — только у исключения. Красное = просрочка/риск. Виджет «всё хорошо» — тихий.
3. Одна форма — одна роль: статус ≠ категория ≠ счётчик. Категория — тихий тег без заливки.
4. Заголовки виджетов/секций — один стиль: 11-12px/500-600, muted, без цветного окраса.
5. Информативный текст не приглушать opacity (правило visual-audit P0) — только токеном.

---

## РАЗВЕДКА

```bash
git status --short
grep -n "font-extrabold" src/components/dashboard/DashboardHome.tsx src/components/widgets/TasksSidebar.tsx
grep -n "без изменений" src/components/dashboard/DashboardHome.tsx
grep -n "opacity-50" src/components/dashboard/DashboardHome.tsx
grep -n "tracking-widest" src/components/widgets/TasksSidebar.tsx
grep -n "fontSize: '48px'" src/components/dashboard/DashboardHome.tsx
# Секции /tasks: цвета живут НЕ литералами в JSX, а в LANE_CONFIG (validators/task.ts),
# AccordionLane читает config.color / config.bg. /tasks рендерит KanbanBoard → AccordionLane
# (LaneColumn страницей не используется):
grep -n "LANE_CONFIG" src/lib/validators/task.ts src/components/tasks/AccordionLane.tsx
grep -n "config.color\|config.bg" src/components/tasks/AccordionLane.tsx
```

---

## ЗАДАЧА 1: KPI-карточки /overview — новая анатомия (дефолт-ветка)

Файл: `src/components/dashboard/DashboardHome.tsx`, функция `KpiCards`.

КРИТИЧНО ПРО СТРУКТУРУ: в live-коде washi и default сидят в ОДНОЙ shared-ветке
return (ветвление только `{wm ? иконкаА : иконкаБ}`). Буквальная замена этого
return предложенным ниже JSX УНИЧТОЖИТ washi (kanji watermark, цветная иконка,
wm.short). Поэтому сначала развести ветки:

```tsx
if (fm) { /* fuji — как было, правки только по задаче 2 */ }
if (wm) { /* washi — ВЫНЕСТИ текущий shared-JSX сюда БЕЗ ИЗМЕНЕНИЙ (kanji + иконка + wm.short) */ }
// default — только здесь новая анатомия из блока ниже
```

Washi-ветка после разноса остаётся байт-в-байт текущей (включая её opacity на
иконке — washi вне scope). Новая анатомия — ТОЛЬКО в default-ветке.

Было (default): иконка-круг слева + значение `text-2xl font-extrabold` + label 11px снизу.
Стало (вертикальная анатомия, без иконки-круга):

```tsx
return (
  <a
    key={c.label}
    href={c.href}
    data-kpi
    className={`group relative overflow-hidden flex flex-col rounded-lg bg-surface px-4 py-3.5
               elevation-hover border border-border ${staggerClass(i)}`}
  >
    {/* Label — тихий, сверху */}
    <div className="text-xs text-text-dim leading-tight" title={c.sub}>
      {c.label}
    </div>
    {/* Value — главный элемент */}
    <AnimatedNumber
      value={c.num}
      formatFn={c.fmt}
      className={`mt-1 text-2xl font-semibold leading-tight tabular-nums block
                  ${isEmpty ? 'text-text-mute' : 'text-text-main'}`}
    />
    {/* Delta / контекст */}
    {'trend' in c && c.trend != null
      ? <div className="mt-0.5"><TrendBadge delta={c.trend} /></div>
      : c.sub && <div className="mt-0.5 text-[11px] text-text-mute leading-tight truncate">{c.sub}</div>}
  </a>
);
```

Детали:
- `font-extrabold` → `font-semibold` (вес 600 достаточен, 800 кричит).
- Пустое значение: `opacity-50` УБРАТЬ — приглушение только цветом `text-text-mute`
  (правило P0 visual-audit).
- Иконки `c.icon` и `c.iconBg` из дефолт-ветки убрать (в washi-ветке иконка остаётся).
  Если tsc заругается на неиспользуемые поля — поля в массиве `cards` оставить
  (их использует washi-ветка), убрать только рендер.

В `TrendBadge`: при `delta === 0` возвращать `null` вместо «→ без изменений» —
нулевая дельта на каждой карточке это шум:

```tsx
function TrendBadge({ delta, label = 'за нед.' }: { delta: number; label?: string }) {
  if (delta === 0) return null;
  ...
}
```

## ЗАДАЧА 2: Fuji watermark — вернуть иерархию значению

Файл: тот же, fuji-ветка `KpiCards` (константа `FUJI_KPI_META` + рендер `fm`).

Ватермарка `fontSize: '48px'` при значении `text-3xl` (30px) — фоновый декор
крупнее данных. Фичу сохраняем, иерархию чиним:

- `fontSize: '48px'` → `'30px'`
- В fuji-карточке НЕТ label вообще (только ватермарка) — добавить тихий label
  над значением, как в задаче 1: `<div className="text-xs text-text-dim">{c.label}</div>`.
  Ватермарка остаётся атмосферой, label — читаемым именем метрики.

## ЗАДАЧА 3: PortfolioRiskWidget — тихий при нуле рисков

Файл: `src/components/dashboard/PortfolioRiskWidget.tsx`

Ветку `hasRisk` НЕ трогать (там всё правильно). Ветку «рисков нет» заменить:
вместо полноразмерного виджета с зелёным `text-3xl` нулём — одна строка:

```tsx
if (!hasRisk) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface px-4 py-2.5 elevation-hover">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green" />
      <span className="text-xs text-text-dim">
        <span className="font-medium text-text-main">Портфель внедрений:</span>{' '}
        {rows.length} активных, рисков нет
      </span>
      <Link
        href="/projects?tab=portfolio"
        className="ml-auto flex items-center gap-1 text-[11px] text-accent hover:underline"
      >
        Портфель <ArrowRight size={12} />
      </Link>
    </div>
  );
}
```

(ветку вставить после guard'ов isLoading/error, до текущего return; из текущего
JSX убрать ставшую мёртвой zero-state ветку `: <p>Нет активных внедрений...</p>`
и условные заголовки `hasRisk ? ... : ...` упростить до risk-варианта).

`counts.attention > 0` при нуле красных: добавить в тихую строку
` · ${counts.attention} требуют внимания` классом `text-yellow` (утилита уже
маппится на `var(--yellow-text, var(--yellow))` в globals.css — отдельного
класса text-yellow-text НЕ существует).

## ЗАДАЧА 4: TasksSidebar — убрать декоративный вес

Файл: `src/components/widgets/TasksSidebar.tsx`

4.1. Внутренний `ClockWidget`: `text-4xl font-extrabold` часы → компактная строка.
Заменить рендер на:

```tsx
return (
  <div className="flex items-baseline justify-between rounded-lg bg-surface px-4 py-3 elevation-1">
    <span className="text-lg font-semibold tabular-nums text-text-main">{time}</span>
    <span className="text-xs text-text-mute capitalize">{dayName}, {date} · нед. {weekNum}</span>
  </div>
);
```

4.2. Заголовки виджетов — один нейтральный стиль вместо цветных:
- `PlannedCalls`: `text-xs font-bold uppercase tracking-widest text-green` →
  `text-[11px] font-semibold uppercase tracking-wide text-text-mute`
- `FocusWidget`: то же самое (убрать `text-yellow` и с заголовка, и оставить
  иконке `Target` нейтральный `text-text-mute`)
- `MiniKpi` «Сейчас в работе»: `text-accent` → `text-text-mute`. ВНИМАНИЕ:
  заголовок продублирован в ОБЕИХ ветках MiniKpi — washi и default; нейтрализовать
  оба (kanji-ячейки washi при этом не трогать — они из задачи 4.3 исключены).

4.3. `MiniKpi`, дефолт-ветка (не washi): значения покрашены декоративно
(`text-accent/green/red/yellow`). Цвет оставить ТОЛЬКО у просрочки:

```tsx
const items = [
  { value: active, label: 'Сделок', color: 'text-text-main' },
  { value: weekCalls, label: 'Звонков/нед', color: 'text-text-main' },
  { value: dueTasks, label: 'Задач к сроку', color: dueTasks > 0 ? 'text-red' : 'text-text-main' },
  { value: upMeetings, label: 'Встреч', color: 'text-text-main' },
];
```

`font-bold` у значений → `font-semibold`. Washi-ветку MiniKpi (kanji) не трогать.

## ЗАДАЧА 5: TaskCard — бюджет маркеров

Файл: `src/components/tasks/TaskCard.tsx`

5.1. В `phaseMode` (доска внутри проекта) контекст проекта/компании самоочевиден —
теги «проект» и «компания» скрыть:

```tsx
{!phaseMode && task.project_id && ( ...кнопка проекта... )}
{!phaseMode && task.company_id && ( ...кнопка компании... )}
```

5.2. Вне phaseMode теги перевести из заливки в тихий контур (категория ≠ статус,
у категории нет заливки):
- проект: `rounded bg-accent-l px-1 py-0.5 text-xs text-accent ...` →
  `rounded border border-border px-1 py-0.5 text-xs text-text-mute hover:text-text-main hover:border-border2 transition-colors truncate max-w-[120px] cursor-pointer`
- компания: аналогично (убрать `bg-purple-l text-purple`).

`data-tag`: у project-тега сохранить; у company-тега его сейчас НЕТ — добавить
при рестайле (симметрия семантической разметки).

5.3. `STATUS_BADGE_CLS.next` — «Не начата» на 80% карточек фазовой доски это
инвертированная сигнальная система. Нейтрализовать до едва заметного:

```ts
next: 'border-transparent bg-transparent text-text-mute',
```

(бейдж остаётся кликабельным циклом статуса; жирную рамку/заливку носят только
активные состояния now/wait/done и «Просрочена»).

## ЗАДАЧА 6: Заголовки секций /tasks (AccordionLane) — ОБЯЗАТЕЛЬНАЯ

Файл правки: `src/components/tasks/AccordionLane.tsx`. Заголовки секций
«Сейчас / Следующие / Отложено / Выполнено» окрашены НЕ литералами в JSX,
а через `config.color` / `config.bg` из `LANE_CONFIG`
(`src/lib/validators/task.ts`) — поэтому grep по text-классам в JSX пуст.
Это НЕ значит «уже нейтрально»; задачу не пропускать.

Правки (только в AccordionLane, точечный override):
- заголовок секции: вместо `config.color` →
  `text-[11px] font-semibold uppercase tracking-wide text-text-mute`
- счётчик задач секции: вместо `config.bg` + `config.color` → нейтральный
  `text-text-mute`
- пилюля просрочки (`N просроч.`, `text-red`) — НЕ трогать, это единственный
  легитимный цветной сигнал.

`LANE_CONFIG` в validators/task.ts НЕ мутировать — его цвета читают другие
потребители (Gantt fallback, CommandPalette, LaneColumn). Только override
в AccordionLane. `LaneColumn.tsx` — опционально для консистентности,
/tasks его не рендерит; если не трогаешь — отметь в отчёте.

## ЗАДАЧА 7: Смок по всем темам

```bash
npm run build 2>&1 | tail -20
npm run dev
```

Пройти /overview и /tasks во всех живых темах: aura, washi, fuji, frost,
aurora, tidal (+ minimal, если M1 уже смержен). Чек-лист:
- washi: kanji-ватермарки на KPI и MiniKpi на месте, scramble в сайдбаре работает;
- fuji: ватермарки читаются КАК фон (значение теперь главнее), label появился;
- aura: орбы, text-nav, data-priority тонирование задач — без регрессов;
- тёмные темы: KPI-карточки без иконок не развалились по высоте;
- «Портфель внедрений» при 0 рисков — одна строка во всех темах;
- /tasks: часы компактные, заголовки виджетов однородные, «Не начата» не пестрит.

---

## КОММИТ

Дерево может быть грязным (`_analysis/*`) — только точечный `git add`:

```bash
git add src/components/dashboard/DashboardHome.tsx \
  src/components/dashboard/PortfolioRiskWidget.tsx \
  src/components/widgets/TasksSidebar.tsx \
  src/components/tasks/TaskCard.tsx \
  src/components/tasks/AccordionLane.tsx
# + src/components/tasks/LaneColumn.tsx, если правился (опция задачи 6)
git commit -m "refactor(ui): widget discipline — анатомия KPI, тихий risk-виджет, бюджет маркеров (все темы)"
```

НЕ пушить без подтверждения. Миграций БД нет. Обновление theme-system.md
(«тем 7») — зона спринта M1 / Cowork-гейта, НЕ этого спринта.
