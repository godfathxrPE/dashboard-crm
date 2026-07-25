# Ревью: S-UI-POLISH-1 — точечный polish (F-06ч / F-12 / F-13 / F-14 / F-15 / F-16)

**Дата:** 2026-07-21  
**Ревьюер:** Grok (верификация по live-коду ветки `feat/typo-tokens` @ `4ce56ba` ≡ tip `main` из спринта)  
**Объект:** `_analysis/sprint-S-UI-POLISH-1.md` — client-only polish: ChipFilter loading, QueueRow secondary hover|focus, KPI tabular-nums, pill >90д, нейтральный тинт канбана, truncate company tags, hit-area F-15  
**Контекст:** финал design-волны; 3 под-коммита; миграций/SQL нет. Base `main` @ `4ce56ba` (S-TYPO-TOKENS) — `text-meta` уже в `tailwind.config.ts`. Ветка `feat/ui-polish-1` ещё не создана (ок).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА первой | ✅ якоря/пути верны |
| Base `4ce56ba` / ветка от main | ✅ tip = base |
| 1a ChipFilter `loading` (F-06) | ✅ API нужен; реальный consumer — `ProjectsView` |
| 1a tables / Leads | 🟡 early-return до ChipFilter → `loading` no-op |
| 1b QueueRow F-12 | ✅ `group` + `focused` + W1b-5 always-visible — цель верна |
| 2a KPI `tabular-nums` | ✅ frost ~L268 без; 🟡 washi ~L308 тоже без |
| 2b >90д | ✅ DashboardHome + DeadlineRadar; цвета веток разные |
| 2c «взвеш.» → `text-meta` | 🟡 **NO-OP**: уже `text-xs` (12px) ≥11 |
| 2d PHASE_TINT → `--surface2` | ✅ tint ≠ header; правило волны верно |
| 2e company truncate | ✅ L105–108 без max-w/title |
| 3 F-15 hit-area | 🟡 exploratory; scope-cut правильный |
| SQL / RLS / schema | ✅ N/A (client-only) |
| `git add -A` | ✅ запрещён; стейдж по спискам |

**Оценка: 9/10.** Солидный точечный polish; диагнозы совпадают с кодом; блокеров нет.  
**Рекомендация:** **запускать в CC as-is.** Учесть W1–W7 в ходе (правки файла спринта не обязательны).

---

## Live-разведка (vs claims спринта)

| Claim / якорь | Live @ `4ce56ba` |
|---------------|------------------|
| `ChipFilter` count badge | L38–45: `{opt.count != null && …}` — **0** рендерится (0 ≠ null) |
| `loading?` prop | ❌ нет |
| `QueueRow` path | `src/components/today/QueueRow.tsx` ✅ |
| secondary always visible | L63–71 + коммент `W1b-5` ✅ |
| `group` на корне | ✅ L43 |
| `focused` prop + consumers | ✅; `TodayView.tsx` передаёт `focused={activeIndex === …}` |
| `deadlineUrgency` DashboardHome | L52–61: far = `Через ${days}д` / green, **без** cap |
| DeadlineRadar `getUrgency` | L61–70: far = mute, **без** >90; **widget нигде не монтируется** (см. W7) |
| AnimatedNumber KPI | L265–268 frost **без** tabular-nums; L308–312 washi **без**; L337–341 default **с** |
| `PHASE_TINT_COLOR` | L65–70 = `var(--track-*-current)`; `tintColor` L222 → gradient L233–235 |
| `PHASE_HEADER_COLOR` | L73–78 — отдельно (точка L255) |
| «взвеш.» | L138 → HeroCard L110 `text-xs` (**12px**, не `text-[10px]`) |
| Contacts company tag | L105–108: outer chip + Building2 + name + role; **нет** truncate/title |
| ChipFilter consumers | ProjectsView ×2, ProjectsTable, ContactsTable, CompaniesTable, LeadsView |
| Tables early spinner | Contacts/Companies/Leads/ProjectsTable: `if (isLoading) return <Loader2…>` **до** ChipFilter |
| ProjectsView chips | L78–114: `useProjects` **без** isLoading; counts из `allProjects ?? []` → **ложный 0** |
| `text-meta` токен | `tailwind.config.ts` `meta: '0.6875rem'` (11px) ✅ |
| 7 тем | `theme-store.ts`: aura/washi/fuji/frost/aurora/tidal/minimal ✅ |
| `--surface2` | theme-system / globals ✅ |

---

## С чем согласен полностью

### 1. РАЗВЕДКА и scope

Команды разведки попадают в нужные места; line numbers ±5 актуальны. Client-only, без миграций. Вынос скелетонов и ты/вы — правильно. Три concern-коммита + запрет `git add -A` — ок.

### 2. 1a ChipFilter loading (F-06)

Диагноз верен: `count: 0` ≠ `null` → бейдж «0».  
**Критичный consumer — `ProjectsView`:** чипы направления/quick живут в parent над child-spinner; `const { data: allProjects } = useProjects('deals')` без gate → `?? []` даёт нули.

Таблицы и LeadsView early-return до ChipFilter — ложного 0 на hard reload нет; прокидывать `loading` optional (как в спринте: «если синхронно — можно не»).

Рекомендация CC:

```tsx
// ChipFilter
{opt.count != null && !loading && (/* badge */)}

// ProjectsView
const { data: allProjects, isLoading } = useProjects('deals');
// оба ChipFilter: loading={isLoading}
```

Легитимный post-load `0` — показывать (`loading === false`).

### 3. 1b QueueRow F-12

Не pure-hover rollback: secondary скрыта в покое, видна при **group-hover ИЛИ focused ИЛИ focus-within**. `group` уже есть; `focused` уже прокинут из TodayView. Primary не трогать. Коммент W1b-5 → F-12 — ок.  
Согласуется с `architecture.md` («secondary видима при фокусе») лучше, чем текущий always-visible.

### 4. 2a–2e визуал

- **F-13:** минимум watermark/frost ~L268 (`text-3xl font-bold`); washi ~L308 — тот же concern (см. W1).  
- **F-16 pill:** оба helper’а; cap `if (days > 90)` на «дальней» ветке; цвета **не** унифицировать (Dashboard green / Radar mute).  
- **F-16 взвеш.:** правило «если ≥11 — не трогай» → **NO-OP** (уже `text-xs`).  
- **F-14:** только фон колонки (`tintColor` / `PHASE_TINT_*` → `var(--surface2)`); `PHASE_HEADER_COLOR` / `PHASE_HEADER_TEXT` оставить.  
- **truncate:** name (или chip) + `title`; Building2 size=9 не раздувать.

### 5. 3 F-15 + коммиты

Scope-cut правильный: hit-area ≥24 (цель 32), не иконка; пусто → skip commit 3. Diagnostic grep слабый (multiline), но инструкция «только реальные <24» защищает от раздувания.

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно учесть в CC)

### W1. F-13 — washi AnimatedNumber без `tabular-nums`

Спринт указывает `DashboardHome.tsx:268`. Ветка washi (L308–312, `text-2xl font-extrabold`) тоже без `tabular-nums`. Добавить в том же коммите 2 (тот же F-13).

### W2. 2c «взвеш.» — NO-OP

HeroCard sub уже `text-xs` (12px) ≥ `text-meta` (11px). **Не трогать** — как в правиле спринта.

### W3. ChipFilter `loading` на 4 tables = no-op

Можно ограничиться API + `ProjectsView`. Tables/Leads — optional, harmless.

### W4. F-15 — не раздувать scope

Много `p-0.5` / `p-1` + мелких X (TaskCard, Combobox, SavedViewChips X size=11, DataTable, PeekPanel, …). Либо 1–3 очевидных close/chip-X, либо **пустой commit 3**. Лучше skip, чем +15 файлов.

### W5. F-12 touch без hover

Secondary скрыта в покое: j/k `focused` + `focus-within` закрывают kbd; live-смок обязателен. На pure-touch без focus secondary останется скрытой (осознанный trade-off после W1b-5).

### W6. F-14 ×7 тем

Обязательный live-смок во всех 7 темах (как в спринте). Gradient `color-mix(… surface2 8% …)` — слабый нейтральный wash; ok. Если `PHASE_TINT_COLOR` станет мёртвым — удалить или свести к `surface2`, не оставлять unused map.

### W7. DeadlineRadar — dead export

`DeadlineRadar` экспортируется из `widgets/index.ts`, но **ни один import/mount** в `src/` (overview — `deadlineUrgency` в `DashboardHome`, не виджет). Правка 2b в Radar — согласованность кода, но **не видна в live-смоке**. Smoke F-16 «>90д» проверять на `/overview` (DashboardHome).

### W8. Contacts truncate на `inline-flex` chip

Outer span — `inline-flex`. `truncate` надёжнее на inner `<span className="max-w-[140px] truncate">` вокруг имени (и `title`), либо `min-w-0 max-w-[140px]` на chip. Не ломать role-suffix.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `DashboardHome.tsx` | ~308–312 | washi KPI: +`tabular-nums` (W1) |
| `ProjectsView.tsx` | ~78, 102–114 | **обязательный** `loading` для F-06 |
| `SavedViewChips.tsx` | ~65–71 | крестик X size=11 — кандидат F-15, если commit 3 не skip |
| `DeadlineRadar.tsx` | 61–70 | правка ok, но UI не монтируется (W7) |

Ложных путей в спринте нет. `PipelineBoard` application tint ~L222/235 (спринт ~222/232) — ok.

---

## Предлагаемые правки в спринт (optional, не блокируют CC)

1. 1a: явно «обязательный consumer — `ProjectsView`; tables/Leads — early-return, optional».  
2. 2a: «все KPI AnimatedNumber без tabular-nums (frost L268 + washi L308)».  
3. 2c: «ожидаем NO-OP — sub уже `text-xs`».  
4. 2b smoke: «live — только DashboardHome; DeadlineRadar currently unmounted».  
5. 3: whitelist 2–3 close targets **или** skip, не «весь `src/components`».

---

## Чеклист crm-architect

- [x] РАЗВЕДКА первой  
- [x] Реальные пути (architecture: QueueRow today/, DashboardHome overview, PipelineBoard projects/)  
- [x] learnings: 7 тем, CSS variables (`--surface2`), font tokens — учтены  
- [x] SQL/migrations — нет  
- [x] RLS / `org_id` — N/A  
- [x] CSS: только токены/utility (`surface2`, `text-meta`, track-*), без hardcoded palette  
- [x] schema.md update — N/A  

---

## Out of scope (подтверждено)

- Скелетоны loading (полный F-06)  
- ты/вы copy  
- SQL / RLS / migrations  
- Merge в main (только push + gate Cowork)

---

## Smoke checklist (после CC / для гейта)

| # | Что | Pass? |
|---|-----|-------|
| 1 | `npx tsc --noEmit` | |
| 2 | `/deals` reload: direction/quick chips **без** мигания «0» | |
| 3 | `/` QueueRow: secondary hidden → hover / j-k focus; primary always | |
| 4 | `/overview` KPI digits tabular (все 3 ветки тем, если применимо); far deadline `>90д` | |
| 5 | `/deals` pipeline: column bg neutral; header dot colored ×7 themes | |
| 6 | `/contacts` long company name truncate + title | |
| 7 | F-15: only if changed — hit ≥24/32 | |
| 8 | 3 под-коммита; без `_analysis/` / `.grok/` в diff | |

---

## Итог для оператора

| | |
|--|--|
| **Можно в CC?** | **Да** |
| **Base** | `main` @ `4ce56ba` → `feat/ui-polish-1` |
| **Ожидаемый diff** | ~5–10 файлов; 2–3 коммита (3-й часто skip; 2c no-op) |
| **Риск** | низкий (UI-only); F-14 theme-sensitive; F-12 UX regression на pure-touch |
| **Блокеры** | нет |
