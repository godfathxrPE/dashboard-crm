# Claude Code — Синхронизация скилла crm-architect (2026-07-15, пост-Волна-2)

Скилл — production-память проекта (`~/.claude/skills/crm-architect/references/`), НЕ в репо.
За сессию Cowork скилл соврал ТРИЖДЫ (9 тем/дефолт scandi; несуществующий `components/modals/`; «Radix в стеке»).
Обновляй **диф-стилем**: правь только устаревшее, стиль/структуру файлов сохраняй. Факты ниже сверены по живому коду (`main`, пост-пуш Волны 2).

## РАЗВЕДКА
```bash
ls ~/.claude/skills/crm-architect/references/ && wc -l ~/.claude/skills/crm-architect/references/*.md
cd ~/Downloads/dashboard-crm
sed -n '1,12p' src/lib/stores/theme-store.ts          # THEMES/DEFAULT/LEGACY
grep -n "@radix\|@dnd-kit\|lucide" package.json         # Radix НЕТ
ls src/app/\(dashboard\)/ src/components/               # структура
sed -n '1,40p' docs/schema.md                           # актуальная схема (ведётся из живой БД, до 046)
```

## ЗАДАЧА 1 — `references/theme-system.md` (главная ложь: 9 тем / дефолт scandi)
Источник правды — `src/lib/stores/theme-store.ts` + `src/app/layout.tsx` + `src/components/settings/SettingsContent.tsx`.

- **Тем 6, не 9.** Заменить таблицу «Available Themes» на актуальные (порядок = `THEMES`, он же порядок `cycleTheme`):
  | Класс | Заметка |
  |-------|---------|
  | `t-aura` | **Дефолт.** Light orbs / gradient accents. Пикер: «Аура» `#E0A03A` |
  | `t-washi` | Japanese paper. «和紙 Washi» `#C23B3B` |
  | `t-fuji` | Font override → IBM Plex Sans (`--font-app`). «富士 Fuji» `#2B5078` |
  | `t-frost` | **Dark, glass.** Semi-transparent `--surface`. `#6ba3be` |
  | `t-aurora` | **Dark, glass.** `#7c6bc4` |
  | `t-tidal` | **Dark, glass.** `#4a9e8e` |
- **`scandi`/`paper`/`sand` УДАЛЕНЫ** (AUDIT C, ~8 спринтов назад). В сторе — `LEGACY_THEMES = ['t-scandi','t-paper','t-sand']`, persisted-значение из них ИЛИ неизвестное → миграция на дефолт `t-aura`.
- **Дефолт — `t-aura`, НЕ `t-scandi`.** Везде, где «Default: Scandi / t-scandi» → `t-aura`.
- **FOUC-гард** (`layout.tsx`): `<html>` дефолтит классом `t-aura`; inline parser-blocking скрипт (`id=theme-init`) свопает на persisted valid-тему из `localStorage['dashboard-theme']`; неизвестное → остаётся `t-aura`. Убрать упоминания scandi/scandi-dark из этого раздела.
- **scandi-dark `@media (prefers-color-scheme: dark)` — УДАЛЁН.** Строку «9 theme classes + system dark variant» → «6 theme classes» (без dark-variant у дефолта; dark-темы отдельными классами frost/aurora/tidal). Token contexts пересчитать: `:root` + 6 тем (scandi-dark-блока нет).
- **Dark-glass = frost/aurora/tidal** (их `--surface` полупрозрачный). `[data-modal]`-оверрайды ЖИВЫ: `.t-frost [data-modal]{#1e2233}` / `.t-aurora{#1a1e2c}` / `.t-tidal{#102119}` + backdrop-blur на оверлее. Убрать `.t-scandi [data-modal]` и «Scandi/scandi-dark own override» — их больше нет.
- **Стор — `src/lib/stores/theme-store.ts`** (Zustand persist, ключ `dashboard-theme`, экспорт `THEMES/DEFAULT_THEME/LEGACY_THEMES`). Исправить, если в файле указан `lib/hooks/use-theme.ts`.

## ЗАДАЧА 2 — `references/architecture.md` (modals-путь + Radix — ложь)
- **Radix НЕ в стеке.** Убрать «ui/ — Radix UI primitives». Реальные UI-зависимости: **`@dnd-kit`** (core/sortable/utilities), **`lucide-react`** (иконки), Next 15 + React 19. Модалки — **кастомный `src/components/shared/Modal.tsx`** (не Radix Dialog). `components/ui/` — кастомные примитивы, не Radix.
- **Модалки КОЛОКИРОВАНЫ с фичей**, папки `components/modals/` НЕТ: `components/tasks/TaskModal.tsx`, `projects/ProjectModal.tsx`, `calls/CallModal.tsx`, `meetings/MeetingModal.tsx`, `contacts/ContactModal.tsx`, `companies/CompanyModal.tsx`. Общий шелл — `shared/Modal.tsx`.
- **Роуты под `app/(dashboard)/`** (route group): `analytics, calendar, calls, companies/[id], contacts/[id], deals/[id], leads, meetings, overview, projects/[id], settings, tasks` (+ `page.tsx`, `dashboard-content.tsx`, `layout.tsx`). Сделки — `deals/[id]` (не `projects/`); проекты внедрения — `projects/[id]`.
- **`components/` актуальный список:** `ai, analytics, calendar, calls, companies, contacts, dashboard, layout, leads, meetings, migration, projects, settings, shared, tasks, today, ui, widgets`. Обновить file-tree.
- **Тема-стор** — `lib/stores/theme-store.ts` (не `lib/hooks/use-theme.ts`).
- **Gantt (Волна 2, новое):** `components/tasks/GanttTimeline.tsx` (CSS-grid, read-only PM-Гант), `lib/hooks/use-project-schedule.ts` (swimlane по фазе = `column_id`→колонка `category='phase'`), бакет-хелперы в `lib/utils/date-helpers.ts`; таб «Гант» на ProjectDetail.

## ЗАДАЧА 3 — `references/schema.md` (снимок отстал: 041 → live 046)
Скилл-снимок ведётся из репо `docs/schema.md` (актуален из живой БД). **Пере-снять** `references/schema.md` из `docs/schema.md`. Ключевые дельты с 041:
- **042** activity_log entity-links · **043** `won_reason`/`won_detail` на projects · **044/044b** `spawn_delivery_project` +`p_owner_id` · **045** `notify_deal_won` (триггер won→notification; CHECK `notifications_type_check` += `deal_won`) · **046** `tasks` += `start_date`/`end_date date` (nullable) + CHECK `tasks_dates_order_chk`.
- Ранее незафиксированное: `tasks.is_milestone` (P3), `project_columns.category` += **`'phase'`** (P2a/b, `ColumnCategory` = backlog|started|paused|done|phase), delivery-поля projects (parent_deal_id/delivery_kind/do_*/progress_*).
Заголовок «applied 001–041» → «001–046».

## ЗАДАЧА 4 — `references/learnings.md` (дописать гочи Волны 2, диф-стилем)
- Тем 6 (не 9); дефолт t-aura; scandi/paper/sand удалены (AUDIT C).
- Radix НЕ в стеке — модалки/примитивы кастомные (`shared/Modal`).
- Тултип/поповер внутри `overflow-x-auto` клиппится (overflow-x:auto ⇒ overflow-y не visible) → `position: fixed` или портал.
- Gantt-фаза = `column_id`→колонка `category='phase'` (`isPhaseBoard`), НЕ `phase_group` пайплайна. Swimlane data-driven.
- Календарные вычисления из timestamptz на клиенте: `mskDateKey` (Intl en-CA, Europe/Moscow); бакет/инкремент дня на UTC-полдне (`T12:00:00Z`) — иначе off-by-one.
- Типы сущностей derived (`entities.ts` ← `supabase.gen.ts`) → аддитивная колонка = только regen, руками entities/database не трогать (искл. hand-authored union). `.refine()` → `ZodEffects` (теряет `.shape/.extend`). `''::date` invalid → `setValueAs '' → null`.
- `AFTER UPDATE OF <col>` не фичит derived-by-BEFORE-trigger колонки → plain `AFTER UPDATE`+WHEN; `EXCEPTION WHEN OTHERS` маскирует constraint. Коммит гейтить по `git show --stat`.

## ПРОВЕРКА
```bash
grep -rn "scandi\|9 тем\|9 theme\|components/modals\|Radix\|use-theme.ts" ~/.claude/skills/crm-architect/references/ \
  | grep -v "LEGACY\|удал\|scandi-dark.*удал"   # остаточной лжи быть не должно (кроме явных «удалено»-пометок)
```
Скилл в репо не версионируется — коммитить нечего. Это правка `~/.claude/skills/`, не проекта.
```
Type Safety / RLS — NOT_APPLICABLE (правка доков скилла, не код).
```
