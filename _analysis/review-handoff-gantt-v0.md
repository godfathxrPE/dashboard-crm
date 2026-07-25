# Ревью: handoff-gantt-v0 (S-GANTT-V0-1)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, ahead of origin/main на 4 коммита Gantt; schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/handoff-gantt-v0.md` — spike Gantt v0: CSS-grid без либы, таб на `ProjectDetail`, read-only + клик → `TaskModal`  
**Контекст:** зависимость 046 (`supabase/migrations/046_gantt_dates_on_tasks.sql`, S-GANTT-DATES-1); предыдущее ревью `_analysis/review-handoff-gantt-v0.md` (2026-07-15); после v0 в репо уже VIEW-1/2, S-DEPS-1, S-CRIT-PATH

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Историческое качество промпта (как handoff до CC) | ✅ Зрелый UI-spike |
| РАЗВЕДКА + реальные пути/хуки (на момент v0) | ✅ |
| Schema truth (`tasks.start_date`/`end_date`/`deadline`, CHECK 046) | ✅ |
| Дата-математика (MSK, UTC-полдень, inversion clamp) | ✅ |
| Интеграция `ProjectDetail` + `TaskModal` | ✅ |
| crm-architect checklist (UI, без миграций из CC) | ✅ |
| **Актуальность для запуска сейчас** | ❌ **Уже реализовано и сильно расширено** |
| Риск повторного запуска в CC | ❌ Перезапишет 769-строчный Gantt + сломает Волна 2 |

**Оценка: 9/10** как handoff-спека (качество дизайна/гейт-нот).  
**Рекомендация: не запускать в Claude Code.** Работа v0 уже в `main` (`685864d`); текущий `GanttTimeline.tsx` — post-VIEW-2/DEPS/CRIT-PATH. Повторная «реализация» handoff уничтожит последующие фичи.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 046 `start_date`/`end_date` + CHECK | ✅ файл + типы + `TaskModal` форма |
| `mskDateKey` в `date-helpers.ts` | ✅ идентичен snippet handoff (`:21–24`) |
| `GanttTimeline` + таб `timeline` | ✅ `685864d` (`feat(gantt): v0 таблица-таймлайн…`) |
| Лейбл таба «Таймлайн» | 🔄 переименован в **«Гант»** (`bbfdffd`, `ProjectDetail.tsx:768`) |
| Данные `useProjectBoard` внутри Gantt | 🔄 Gantt → `useProjectSchedule` (обёртка над board+columns, swimlanes) |
| Zoom day/week/month | ✅ post-v0 (`0ea9f1d`, `buildBuckets`) |
| Drag resize/move | ✅ VIEW-2 (`6d86d37`) |
| Зависимости / critical path | ✅ S-DEPS-1 + S-CRIT-PATH (текущий tip `main`) |
| Следующие handoff | `handoff-gantt-view1*.md`, `handoff-gantt-view2-drag.md` — отдельные этапы |

---

## С чем согласен полностью

### 1. Scope v0

- Spike без либы, day-колонки, read-only + edit via modal — правильный минимальный гейт.
- Zoom/drag явно out-of-scope v0; в репо они пришли отдельными коммитами — граница handoff соблюдена.
- Per-project таб, не глобальная страница — совпадает с моделью «план во времени = план проекта» и RLS на `useProjectBoard`.

### 2. Schema / типы (crm-architect `schema.md`)

- `tasks.start_date` / `end_date` date nullable, CHECK `tasks_dates_order_chk` — в schema.md (блок 046) и в `supabase.gen.ts` (`tasks.Row`, ~1928–1938).
- `deadline` — `timestamptz` (не `date`) — handoff верно требует `mskDateKey`, не `.slice(0,10)`.
- CHECK покрывает только пару start/end; inversion с deadline — на рендере: handoff явно клэмпит `if (end < start) end = start` — **обязательно и верно**.
- Типы derived: «не трогать entities» — согласуется с learnings (аддитивная колонка = regen only).

### 3. Дата-математика = ядро (learnings Волна 2)

Живой код сохранил ту же семантику:

| Правило handoff | Факт |
|-----------------|------|
| `mskDateKey` = Intl `en-CA` + `Europe/Moscow` | `date-helpers.ts:21–24` — байт-в-байт |
| `buildDays` на `T12:00:00Z` | v0; сейчас обобщено в `buildBuckets` / `noonMs` с тем же UTC-полднем |
| Fallback span | `use-project-schedule.ts` `effectiveSpan` — та же цепочка, что `taskSpan` в handoff |
| `today` через `mskDateKey` | `GanttTimeline.tsx:431` |

### 4. Точки интеграции (сверка с кодом)

| Утверждение handoff | Факт сейчас |
|---------------------|-------------|
| `ProjectDetail.tsx` | `src/components/projects/ProjectDetail.tsx` |
| `editingTask` / `taskModalOpen` + `TaskModal` | `:172–173`, mount `:841–844` |
| `onEditTask` → `setEditingTask` + `setTaskModalOpen(true)` | `:794` — как в handoff 3.4 |
| `useProjectBoard` → `{ tasks, isLoading, isError }` (spread query) | `use-tasks.ts:66–93` — совпадает; Gantt теперь ходит через schedule-обёртку |
| Импорт рядом с `ProjectBoard` | `:51–52` |
| Union таба включает `'timeline'` | `:165` |
| Delivery: `isDelivery` + лейбл «План» | `:215`, `:767` |

### 5. CSS / темы

- Токены `bg-accent` / `bg-red` / `bg-yellow` / `bg-green`, `border-border`, `text-text-*` — семантические, через CSS variables (`globals.css`).
- Opacity-модификаторы (`border-accent/30`, `border-border/40`) уже приняты в кодовой базе; fallback в handoff уместен.
- `LABEL_W = '12.5rem'` — rem-конвенция; live Gantt оставил ту же константу (`GanttTimeline.tsx:32`).

### 6. a11y / гейт-ноты

- `aria-label` на барах — в handoff есть; live — то же (`:215`, `:231`).
- Чипы «Без дат» с видимым `task.text` — aria-label не нужен — корректно.
- `npx tsc --noEmit` как главный гейт + отказ от bridge-build (SWC arm64) — согласуется с handoff DATES / практикой репо.
- «Не оптимизировать >~120 дней в v0» — правильный anti-scope для CC.

### 7. crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column names  
- [x] Реальные file paths (с оговоркой architecture.md мог устареть на момент написания — handoff это честно говорит; **сейчас** architecture.md уже описывает post-v0 Gantt)  
- [x] learnings gotchas (MSK, UTC-полдень)  
- [x] Нет SQL-миграций из CC  
- [x] org_id/RLS — через существующий хук, не новый surface  
- [x] Нет `flowType: 'implicit'`  
- [x] CSS variables / theme tokens  
- [x] schema.md не требует обновления этим спринтом (046 уже отражён)

---

## Блокеры (для запуска **сейчас**)

### B1. Handoff уже исполнен — повторный прогон деструктивен

Репо:

- `mskDateKey` уже в `date-helpers.ts`
- `GanttTimeline.tsx` — **769 строк** (не ~150 из snippet)
- данные: `useProjectSchedule`, zoom, swimlanes, drag, deps, critical path
- таб value `timeline`, label **«Гант»**

Задачи handoff:

1. «добавить `mskDateKey`» → дубль export / конфликт  
2. «новый `GanttTimeline.tsx`» → **полная перезапись** текущего файла  
3. правки `ProjectDetail` → no-op или регресс лейбла «Гант» → «Таймлайн»

**Не отдавать в CC как «сделай спринт».** Исторический артефакт / reference для gate notes.

### B2. РАЗВЕДКА ожидает pre-v0 состояние — на `main` она «красная» по смыслу

Команды handoff ждут:

```text
useState<'activity' | 'board'>
```

Факт:

```text
ProjectDetail.tsx:165  useState<'activity' | 'board' | 'timeline'>
```

Исполнитель, слепо сверяющий «ожидаем», либо остановится, либо «исправит» уже эволюционировавший код. Для re-run нужен явный статус **DONE / SUPERSEDED** в шапке handoff (правка файла — по запросу, сейчас не делалась).

---

## Предупреждения (исторические / косметика)

### W1. «9 тем» vs 6 живых

Handoff: «не дефолтим под **9** тем».  
Факт: `THEMES` = 6 (`t-aura`…`t-tidal`, `theme-store.ts`); architecture.md / learnings — **6 тем**. Смысл (без сторонней Gantt-либы) верный, число устарело.

### W2. Путь в РАЗВЕДКЕ

```bash
cd …/src
grep … ../src/components/projects/ProjectDetail.tsx
```

При `cd src` корректнее `components/projects/…`. Не блокер, путает.

### W3. architecture.md на момент v0 vs сейчас

Handoff справедливо писал, что architecture устарел. **Сейчас** `architecture.md:158–164` уже фиксирует post-v0 PM-Гант (`GanttTimeline`, `use-project-schedule`, бакеты, fixed-tooltip). Для ретро-ревью v0 это не ошибка промпта.

### W4. Лейбл «Таймлайн» vs «Гант»

v0-контракт handoff — «Таймлайн»; продукт ушёл на «Гант». При архивации handoff не переписывать историю; при новых спринтах ссылаться на текущий UI.

### W5. `useProjectBoard` vs schedule

v0-дизайн «звать `useProjectBoard` прямо из Gantt» — валиден для spike. Эволюция в `useProjectSchedule` (фаза = `column_id` / `category='phase'`, **не** `phase_group`) — learnings; не регресс v0-спеки.

### W6. Предыдущее ревью (2026-07-15)

Рекомендации (aria-label, смок only-start / delivery, долг wide range) **уже в текущем тексте handoff** (mtime handoff позже review). Исторические W из старого review закрыты на уровне документа; implementation ушла дальше.

---

## Пропущенные места

Для **исходного** v0-scope grep не находит обязательных gaps: интеграция только `ProjectDetail` + новый компонент + helper.

| Файл | Замечание | Действие при re-run |
|------|-----------|---------------------|
| `src/components/tasks/GanttTimeline.tsx` | Уже 769 LOC post-v0 | **Не перезаписывать** |
| `src/lib/hooks/use-project-schedule.ts` | `effectiveSpan` = taskSpan v0 | Не дублировать span в двух местах |
| `src/lib/utils/date-helpers.ts` | `mskDateKey` + bucket API | Не добавлять второй `mskDateKey` |
| `src/components/projects/ProjectDetail.tsx:768` | label «Гант» | Не откатывать на «Таймлайн» без отдельного UX-решения |

Ложных «надо ещё сюда» для v0 нет (не Sidebar, не global `/gantt`, не новые RPC).

---

## Предлагаемые правки в спринт

1. **Шапка статуса (рекомендуется при следующем касании файла):**
   ```markdown
   > **STATUS (2026-07-16): DONE** — `685864d`. SUPERSEDED by VIEW-1/2, S-DEPS-1, S-CRIT-PATH.
   > **Do not re-run in Claude Code** — clobber risk on `GanttTimeline.tsx`.
   ```
2. Исправить «9 тем» → «6 тем» (косметика).
3. В РАЗВЕДКЕ путь без `../src` при `cd src`.
4. Не менять тело задач 1–3 — они остаются корректной **исторической** спекой v0.

---

## Чеклист перед CC

- [x] 046 / gen types / `TaskModal` start-end — prerequisite выполнен  
- [x] Качество промпта (математика, scope, gate notes) — достаточно для исторического «можно было запускать»  
- [ ] **Запуск v0 сейчас** — **запрещён** (B1)  
- [ ] Если цель — новая работа: брать актуальные handoff (`view1` / `view2` / deps), не v0  
- [ ] Нативный `npm run build` на Маке — по-прежнему gate перед пушем волны (как в handoff)  
- [ ] Не пушить / не force-rewrite Gantt «под v0»

---

## Итог

`_analysis/handoff-gantt-v0.md` — **сильный, корректный UI-handoff**: schema-truth, TZ-математика, точечная интеграция, честный out-of-scope, хорошие gate notes. На момент 2026-07-15 его можно было отдавать в CC (что и произошло: `685864d`).

**На 2026-07-16:** спринт **закрыт и пережит**. Вердикт гейта Cowork — **архив / reference only; Claude Code не запускать.**
