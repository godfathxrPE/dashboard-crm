# Ревью: S-TYPO-SCALE v2 — микротекст + tabular (F-01 / F-10 / F-02 partial)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/ui-quickwins` @ `b3eebd9`; crm-architect `architecture.md` / `learnings.md`; schema N/A)  
**Объект:** `_analysis/sprint-S-TYPO-SCALE.md` — v2: floor `text-xs` (12px) для читаемого ≤10px (px+rem), выбросы 15/32/2.5rem/12px, `table { tabular-nums }`; без `tailwind.config`  
**Контекст:** предшествующее ревью (7/10, B1 rem / B2 DoD / W1–W4) учтено в шапке v2; client-only; blast radius HIGH; ветка `feat/typo-scale`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live (px + rem) | ✅ сходится |
| Правило A/B + badge-allowlist (5) + StageChip→prose | ✅ |
| DoD F-01 (8/9/0.625rem = ∅) | ✅ честный; 🟡 не ловит «забытые» `text-[10px]` |
| F-02 partial (15/32/2.5rem/12/0.75, не 13/11) | ✅ |
| F-10 `table {}` + не дублировать L811 | ✅ |
| Claim «F-01 полностью» | 🟡 Tailwind-классы — да; inline `fontSize` ≤10 — нет |
| Scope / границы / commit paths | ✅ |
| SQL / RLS / schema | ✅ N/A |
| Готовность к CC | ✅ GO |

**Оценка: 9/10.** v2 закрыл блокеры v1; разведка и A/B-правило совпадают с live; DoD больше не врёт. Остаются предупреждения: слабый post-gate по «лишним» `text-[10px]`, inline-стили вне инвентаря, геометрия ~160 бампов 10→12.

**Рекомендация:** **запускать в CC as-is.** Желательно перед/в коммите усилить DoD одной строкой (W1); inline-стили — явно OOS или мини-follow-up (W2). Широкий смок обязателен.

---

## Live-разведка (сверка claims)

| Claim спринта | Live @ `b3eebd9` | |
|---------------|------------------|--|
| База `feat/ui-quickwins` / HEAD | `feat/ui-quickwins`, `b3eebd9` S-UI-QUICKWINS | ✅ |
| `fontSize` в `tailwind.config.ts` | пусто | ✅ |
| ≤10px px | **1×8 + 13×9 + 161×10 = 175** | ✅ |
| `text-[0.625rem]` | **5** (TaskCard×4, DeliveryCompletionModal×1) | ✅ |
| ~180 сайтов blast | 175+5 ≈ **180** | ✅ |
| F-02: 15 / 32 / 2.5rem / 12 / 0.75rem | **7 / 2 / 1 / 14 / 1** | ✅ |
| 11px OOS | **75** (спринт «77×» — drift −2) | 🟡 |
| 13px / `0.8125rem` OOS body | **19 / 8** (в т.ч. Card/Table/Button/Input) | ✅ |
| StageChip `PipelineBoard` L175 `text-[9px]` prose | имя стадии + count | ✅ |
| MeetingsList L212 `text-[8px] uppercase` | ✅ | ✅ |
| Badge allowlist линии | Bell L106 `9`, Beacon L73 `9`, Assignee L38 `9`, NavBadge L46 `10`, Heatmap L80 `9` | ✅ |
| globals tabular L811 | `.tabular-nums, [data-kpi], .font-bold, .font-semibold` | ✅ |
| точечные `tabular-nums` | **21** файл в `src/components` (+ `globals.css`) | ✅ |
| `text-xs` = 12px, `text-3xl`≈30, `text-4xl`=36 | default TW | ✅ |
| Junk `.fuse_hidden*` | `src/components/projects/.fuse_hidden…` жив | ✅ |
| `src/app/**/*.tsx` под паттернами | **0** — `git add` без app-tsx ок | ✅ |

---

## С чем согласен полностью

### 1. v1-блокеры закрыты

- **B1:** rem `0.625rem` в разведке, Задаче 2 и DoD.  
- **B2:** DoD больше не требует «нет никаких `text-[Npx]`» — только in-scope 8/9/0.625 + F-02-выбросы.  
- **W1/W2:** allowlist из 5; StageChip явно prose → `text-xs`.  
- **W3:** F-10 = `table {}` рядом с L811, без дубля utility.  
- **W4:** `git add src/components src/app/globals.css`, не `-A`.

### 2. Правило A/B — правильный анти-sed

Без него CC снесёт счётчики в `h-3.5`/`h-4` или оставит prose на 9–10px. Перечисление B-примеров (CallTracker, DashboardHome, TaskCard chips, MeetingsList 8px) совпадает с live 9px-списком.

### 3. F-02 partial + follow-up S-TYPO-TOKENS

Не бампать `0.8125rem`/`13px` body-примитивы и не трогать ~75× `11px` — верный trade-off. `12px`/`0.75rem` → `text-xs` — нулевой визуальный синоним.

### 4. F-10

Реальные `<table>`: `ui/Table.tsx`, `shared/DataTable.tsx` (`<table className="w-full text-sm">`). Global `table { font-variant-numeric: tabular-nums }` закрывает не-bold ячейки; L811 уже кроет bold/kpi. Точечные utility безвредны.

### 5. Scope / crm-architect

Client-only, без миграций, без `theme.fontSize`, CSS через утилиты/одну строку globals. `learnings.md` (темы, CSS vars, не глобальный font-family) не конфликтует. SQL/RLS/org_id N/A.

### 6. Геометрия-дисклеймер

После 10→12 чипы с `py-px` / фикс-`h-*` могут переполниться — чинить контейнер, не откатывать текст. Критично при ~160 свапах.

---

## Блокеры (критично — исправить до запуска)

**Нет.** v2 можно отдавать в CC без правок промпта.

---

## Предупреждения (желательно, не стоп)

### W1. DoD не доказывает закрытие основной массы F-01 (`text-[10px]`)

Гейт:

```bash
grep -rn "text-\[8px\]\|text-\[9px\]\|text-\[0\.625rem\]" …  # ПУСТО
```

ловит только **19** сайтов (1+13+5). Корзина B требует ещё **~156× `text-[10px]`** → `text-xs` (все, кроме 5 allowlist). Ленивый/частичный проход «только 8/9/rem» пройдёт DoD при незакрытом F-01.

**Рекомендуемый доп. гейт (1 строка в спринт или в gate-скрипт CC):**

```bash
# Ожидаем ровно 5 allowlist (или 5 файлов / явный список путей)
grep -rn "text-\[10px\]" src/components src/app | grep -v fuse_hidden
# expect: NotificationBell|StatusBeacon|AssigneeSelect|TextNavSidebar|WeeklyHeatmap only
# (после A: Bell/Beacon/Assignee/Heatmap станут [10px]; NavBadge уже [10px])
```

Задача 2 текстом корректна («пофайлово A/B») — риск в verification, не в инструкции.

### W2. Claim «F-01 полностью» = Tailwind-классы; inline `fontSize` ≤10 вне scope

Live, **не** в разведке спринта:

| Место | Что |
|-------|-----|
| `calendar/CalendarView.tsx` L211 | `fontSize: 9` (счётчик событий) |
| `calendar/CalendarView.tsx` L264 | `fontSize: 10` |
| `layout/EventReminder.tsx` L126, L160 | `fontSize: 10` |
| `layout/ActivityDrawer.tsx` | **~6×** `fontSize: 10` + L293 `fontSize: 9` (count) |
| Recharts ticks (`OverviewCharts`, `Charts`, `CallsChart`) | `tick={{ fontSize: 9\|10 }}` — chrome графиков |

Плюс ~3×9 + ~15×10 inline overall. ActivityDrawer / Calendar / EventReminder — реальный UI, не junk.

**Варианты:** (а) явная строка в ГРАНИЦЫ: «inline `style.fontSize` и Recharts ticks — OOS / S-TYPO-INLINE»; (б) мини-задача 2b для layout+calendar prose. Иначе VERIFICATION «F-01 PASS полностью» слегка overclaim.

### W3. Allowlist узкий — и это ок, но геометрия жёстче

По правилу B уйдут в `text-xs` и «счётчикоподобные» уже-10px:

- `LaneColumn` / `AccordionLane` `h-5` pills  
- `ChipFilter` count, `Badge` sm, `TeamSection`/`ProjectTeam`/`ProjectChat` initials  
- десятки `rounded-full … text-[10px]` мета-пилюль  

Это согласовано с floor 12 и не баг промпта; смок обязан покрыть lanes, chips, kanban counts. При overflow — `h-`/`px`/`leading`, не откат ниже 12.

### W4. Мелочи drift / формулировок

- **11px:** live **75**, не 77.  
- **«Unbounded оставить»** у `text-[32px]`: у KPI в `DashboardHome` / `TasksSidebar` — `text-[32px] font-bold` (+ watermark Noto Sans JP рядом), не Unbounded-класс. На свап `→ text-3xl` не влияет.  
- **tabular «21 файл»:** 21 в components + globals = 22 пути — ок при «точечные в компонентах».

### W5. `table {}` не трогает div-«таблицы»

Часть списков — flex/grid. F-10 audit-закрытие partial by design; для Contacts/Companies `DataTable`/`Table` достаточно.

### W6. База ветки

Сейчас worktree на `feat/ui-quickwins`. Стартовать `feat/typo-scale` от main после merge QUICKWINS **или** от quickwins, если main ещё без него — как в шапке.

---

## Пропущенные места (не в разведке, не блокер)

| Паттерн | ~N | Действие |
|---------|-----|----------|
| `style={{ fontSize: 9\|10 }}` layout/calendar | ~10 | OOS явно **или** 2b |
| Recharts `tick.fontSize` 9/10 | ~8 | OOS (chart chrome) |
| `globals.css` `font-size: 0.6875rem` / `11px` theme | мало | OOS (11px-линия) |
| `Badge.tsx` sm `text-[10px]` | 1 token | → `text-xs` по B (не allowlist) |
| `HealthDot` / `DeliveryHealthDot` sm glyph `text-[10px]` | 2 | → `text-xs` по B |

---

## Предлагаемые правки в спринт (опционально, не GO-gate)

1. **W1** — DoD: после прогона `text-[10px]` только 5 allowlist-сайтов.  
2. **W2** — в ГРАНИЦЫ: inline `fontSize` + Recharts ticks OOS (или 2b).  
3. Поправить «77× 11px» → «~75×»; смягчить «Unbounded» у KPI.  

Без правок CC всё равно может выполнить Задачи 1–3 корректно.

---

## Чеклист перед CC

- [x] РАЗВЕДКА есть (px + rem + F-02 + tabular + OOS 13/11)  
- [x] Реальные пути/линии (StageChip L175, Bell L106, MeetingsList L212, globals L811)  
- [x] Нет SQL / миграций / RLS  
- [x] tailwind `fontSize` не трогаем  
- [x] `git add` без `-A`, без config  
- [x] 13px / 0.8125rem / 11px explicit OOS  
- [ ] (желательно) DoD на остаток `text-[10px]` = allowlist only  
- [ ] Широкий смок aura + одна тёмная: Сегодня, Обзор, Сделки-канбан (StageChip), деталка, таблицы, Settings pills, Bell/Beacon/Assignee, Heatmap, TaskCard chips, lanes counts  
- [ ] После: 8px/9px/0.625rem = 0; 15/32/2.5rem/12/0.75rem = 0; geometry без overflow  

---

## crm-architect checklist

- [x] РАЗВЕДКА перед правками  
- [x] Реальные пути (architecture: `globals.css`, layout/shared/widgets/…)  
- [x] learnings: CSS vars / no global font hacks — соблюдено  
- [x] SQL migrations N/A  
- [x] org_id / RLS N/A  
- [x] SECURITY DEFINER N/A  
- [x] No `flowType: 'implicit'` N/A  
- [x] CSS: utilities + одна scoped global rule  
- [x] schema.md update N/A  

---

## Итог

**S-TYPO-SCALE v2 готов к Claude Code.** Инвентарь и A/B сверены с репо; v1-блокеры сняты. Главные риски исполнения — высокий blast radius (~180 class-сайтов, особенно 10→12) и неполный авто-гейт по «забытым» `text-[10px]`; смок + аккуратный пофайловый проход закрывают. Inline-микротекст (ActivityDrawer/Calendar) останется после спринта — зафиксировать как OOS, чтобы не раздувать «F-01 закрыт» сверх class-scope.
