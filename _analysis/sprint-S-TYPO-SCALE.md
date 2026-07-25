# Claude Code Prompt — Sprint S-TYPO-SCALE: убийство микротекста + tabular (аудит F-01/F-10, F-02 частично)

> **v2** — учтено ревью Grok (7/10; B1 rem-формы, B2 честный DoD, W1/W2 badge-allowlist, W3 существующий tabular, W4 git add). Сверено по коду `feat/ui-quickwins @ b3eebd9`.
> **Тип:** client-only, БЕЗ миграции, БЕЗ изменения tailwind.config. **⚠️ Высокий blast radius** — обязателен широкий смок на гейте. База: `main` (после мёржа S-UI-QUICKWINS) / `feat/ui-quickwins`. Ветка: `feat/typo-scale`.
> **Scope честно:** закрывает **F-01 (Blocker, полностью)** + **F-10 (Medium)** + **F-02 частично** (истинные выбросы 15/32/2.5rem + 12px-синоним). **НЕ закрывает** полную шкалу-токены (body 13-vs-14, meta-токен, 77× 11px) — это дизайн-решение, вынесено в follow-up через `design-system-architect` (см. низ).

---

## WHY

- **F-01 (Blocker):** микротекст ≤10px — читаемый текст нечитаем в рабочем инструменте. Живёт в ДВУХ формах: `text-[8|9|10px]` (px) **и** `text-[0.625rem]` (=10px, rem) — последнее мой первый промпт пропустил (TaskCard chips, DeliveryCompletionModal).
- **F-10 (Medium):** таблицы без tabular-nums (bold/kpi уже покрыты `globals.css:811`).
- **F-02 (частично):** истинные выбросы шкалы (`text-[15px]`, `[32px]`, `[2.5rem]`, `[12px]`-синоним). **13px оставляем** — это осознанный body-размер UI-примитивов (Card/Table/Button/Input = `0.8125rem`), бампать его = менять плотность всего приложения (отдельное решение).

## ПРАВИЛО КЛАССИФИКАЦИИ (ядро спринта — не sed'ить вслепую)

Каждый ≤10px сайт — в одну из двух корзин:

**A. Badge-исключение** (пол `text-[10px]`, убить только 8/9) — ТОЛЬКО эти 5 мест (allowlist, счётчик/1 глиф в size-constrained circle):
- `layout/NotificationBell.tsx` L106 — count в `h-4` circle
- `shared/StatusBeacon.tsx` L73 — count в `h-3.5`
- `shared/AssigneeSelect.tsx` L38 — инициалы в `h-5 w-5`
- `layout/TextNavSidebar.tsx` NavBadge (уже `text-[10px]`) — оставить
- `widgets/WeeklyHeatmap.tsx` L80 — ячейка дня (1–2 глифа)

**B. Читаемый текст** (всё остальное ≤10px, px И rem) → **`text-xs`** (12px). Включая: StageChip имя стадии (проза!), CallTracker «из N», DashboardHome delta/sub, StatsWidget/DeadlineRadar/AutomationsSection, WeeklyHeatmap L87 legend, все `text-[0.625rem]` TaskCard-чипы, DeliveryCompletionModal pill, MeetingsList `text-[8px]` uppercase.

---

## РАЗВЕДКА (энумерация обеих форм — обязательна)

```bash
git status -sb && git log --oneline -1
grep -n "fontSize" tailwind.config.ts   # ждём пусто (config НЕ трогаем)

# F-01: px + rem микротекст (обработать КАЖДЫЙ по правилу A/B)
grep -rn "text-\[8px\]\|text-\[9px\]\|text-\[10px\]" src/components src/app
grep -rn "text-\[0\.625rem\]" src/components src/app        # rem-форма 10px (B1!)

# F-02 выбросы (px + rem)
grep -rn "text-\[15px\]\|text-\[32px\]\|text-\[2\.5rem\]\|text-\[12px\]\|text-\[0\.75rem\]" src/components src/app

# F-10: что уже tabular (НЕ дублировать)
grep -n "font-variant-numeric\|tabular-nums" src/app/globals.css   # ждём L811 .tabular-nums/[data-kpi]/bold

# OUT OF SCOPE — НЕ трогать (зафиксировать, что остаётся): 13px и 11px
grep -rc "text-\[13px\]\|text-\[0\.8125rem\]\|text-\[11px\]" src/components src/app | grep -v ":0" | wc -l
```

**⚠️ Junk:** `src/components/projects/.fuse_hidden*` попадает в grep — игнорировать, не трогать.

---

## ЗАДАЧА 1 — F-10: tabular-nums на таблицы (одна строка)

В `globals.css` рядом с L811 (НЕ дублировать `.tabular-nums`/`[data-kpi]` — они уже есть):

```css
/* Ячейки таблиц (в т.ч. не-bold) выравниваются по разрядам (F-10) */
table { font-variant-numeric: tabular-nums; }
```

Точечные `tabular-nums` в 21 файле — оставить (безвредны). Это и есть закрытие F-10 (не удаление точечных).

## ЗАДАЧА 2 — F-01: истребить микротекст ≤10px (Blocker)

По списку РАЗВЕДКИ, **пофайлово**, применяя правило A/B:
- Корзина **B** (читаемый) `text-[8px]/[9px]/[10px]/[0.625rem]` → **`text-xs`**.
- Корзина **A** (5 badge-мест): `text-[8px]/[9px]` → `text-[10px]`; уже-`[10px]` оставить.
- **StageChip** (`PipelineBoard.tsx` L175): имя стадии `text-[9px]` → `text-xs` (проза, НЕ badge). Вложенный count наследует.

**⚠️ Геометрия:** после бампа чипы/теги/строки с фикс-высотой (`py-px`, `h-*`) могли считаться под 10px — 12px может переполнить/сдвинуть. Где ломается — чуть увеличить контейнер (`py`/`h`/`leading`), НЕ уменьшать текст обратно ниже 12px. `text-[8px] uppercase` (MeetingsList L212) → `text-xs`, капс + tracking оставить.

## ЗАДАЧА 3 — F-02 выбросы (минимально, без 13px/11px)

| Было | Стало | Заметка |
|------|-------|---------|
| `text-[15px]` (7×) | `text-base` (16) или `text-sm` (14) по роли | заголовок→16, текст→14 |
| `text-[32px]` (2×) | `text-3xl` (30) | KPI; Unbounded-шрифт оставить |
| `text-[2.5rem]` (TasksSidebar L43) | `text-4xl` (36) | hero-число |
| `text-[12px]` (14×), `text-[0.75rem]` (Table L47) | `text-xs` | точный синоним, 0 визуальных изменений |

**НЕ трогать:** `text-[13px]`/`text-[0.8125rem]` (body-размер примитивов — отдельное решение), `text-[11px]` (77×, follow-up).

---

## ГРАНИЦЫ SCOPE

Только размеры (F-01 полностью + F-02-выбросы) + tabular. **НЕ** 13px body, **НЕ** 11px (77×), **НЕ** веса/радиусы/тени (F-08/F-09), **НЕ** канбан-карточка (F-04), **НЕ** tailwind.config, **НЕ** цвета/копи.

## ПРОВЕРКА + Definition of Done (честный — только in-scope паттерны)

```bash
rm -rf .next && npx tsc --noEmit 2>&1 | head -20 && npm run build 2>&1 | tail -8   # build не при живом dev

# F-01 закрыт: ни px, ни rem микротекста ≤10px КРОМЕ 5 badge-мест (text-[10px])
grep -rn "text-\[8px\]\|text-\[9px\]\|text-\[0\.625rem\]" src/components src/app   # ПУСТО
# F-02-выбросы закрыты:
grep -rn "text-\[15px\]\|text-\[32px\]\|text-\[2\.5rem\]\|text-\[12px\]\|text-\[0\.75rem\]" src/components src/app   # ПУСТО
# Остаётся ОЖИДАЕМО (out of scope, НЕ гейтить): text-[10px]×5 badge, text-[13px]/0.8125rem body, text-[11px]×77
```

**⚠️ Широкий визуальный смок (aura + одна тёмная):** Сегодня, Обзор (KPI/дельты/виджеты), Сделки-канбан (карточки, StageChip, счётчики), детальная сделки (чек-лист/таймлайн), Контакты/Компании таблицы (меты/теги), Настройки (пилюли), NotificationBell/StatusBeacon/AssigneeSelect (счётчики НЕ переполнены), WeeklyHeatmap, TaskCard (чипы). На каждом: читаемый текст ≥12px, бейджи ≥10 не переполнены, числа выровнены, ничего не съехало.

## КОММИТ (W4 — явный add, без -A, без config)

```bash
git switch -c feat/typo-scale
git add src/components src/app/globals.css   # НЕ -A, НЕ tailwind.config
git status   # убедиться: только typo-свапы src/**/*.tsx + globals.css
git commit -m "fix(typo): истреблён микротекст ≤10px (px+rem) + выбросы шкалы + table tabular-nums (S-TYPO-SCALE, аудит F-01/F-10/F-02-частично)"
```

## VERIFICATION (сборка v2, Cowork)

```
Grok review:     7→addressed — B1(rem-формы), B2(честный DoD), W1/W2(badge-allowlist+StageChip), W3(не дублировать tabular), W4(git add) внесены
Recon:           PASS — px+rem формы сверены live (0.625/0.75/0.8125/2.5rem), L811 tabular, StageChip=проза, 13px=body-примитивов
F-01 (Blocker):  PASS-by-design — весь ≤10px читаемый (px+rem) → text-xs; 5 badge-исключений явные
F-02:            PARTIAL — только выбросы 15/32/2.5rem + 12px-синоним; шкала-токены (13-vs-14 body, meta, 11px) НЕ входят
F-10:            PASS — table{} + существующий L811
Blast radius:    HIGH — ~180 сайтов; правило A/B + пофайлово + широкий смок обязателен
Backward Compat: WARNING — возможны сдвиги в тесных чипах; смок подтверждает отсутствие переполнений
Runtime/Type:    NOT_VERIFIED — гейт
```

---

## FOLLOW-UP (не в этом спринте)

**S-TYPO-TOKENS** через `design-system-architect`: настоящая шкала-токены — решить body 13 vs 14, ввести семантические `text-meta/body/section` (line-height + tracking), консолидировать 77× `text-[11px]` и два 13px-выражения (`[13px]`/`[0.8125rem]`) в один токен. Это дизайн-решение, не механический свап — отдельный заход после того, как Blocker-микротекст (этот спринт) и канбан-карточка (F-04) уедут.
