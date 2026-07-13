# RESULTS — Sprint AUDIT-C «Темы: дефолт aura, минус три темы, один shell»

Дата: 2026-07-13 · Ветка: `main` · Промт: `_analysis/sprint-audit-C-themes.md`
Статус: **реализовано, НЕ закоммичено** (визуальный регресс-прогон по 6 темам — человеческий гейт, см. §5).

---

## 1. Резюме

Удалены три темы (**scandi / paper / sand**), дефолт переведён на **aura**, все темы
переведены на **единый shell** (вертикальное текстовое меню `TextNavSidebar` +
`ContentHeader`). Иконочный `Sidebar` и верхний `Header` удалены.

- **26 файлов** изменено: `+124 / −1575` (нетто **−1451** строки).
- `globals.css`: **2288 → 1621** строк (−667; удалён ~620-строчный `.t-scandi`-блок + токен-блоки paper/sand + декорации + разбросанные `.t-scandi`-правила).
- Удалено 4 файла (`Header.tsx`, `Sidebar.tsx`, `ui/Watermark.tsx`, `ui/WatermarkNew.tsx`), 2 переименовано (`ScandiSidebar→TextNavSidebar`, `ScandiContentHeader→ContentHeader`).
- `grep -r "t-scandi|t-paper|t-sand|SCANDI_" src` = **0** (единственное упоминание — намеренный `LEGACY_THEMES` в `theme-store.ts` для миграции persisted).

Верификация: **tsc ✓ · build ✓ (19/19) · contrast-audit 0 FAIL ×6 тем · vitest 102/102**.

---

## 2. Что сделано (по задачам промта)

### C1 — дефолт → aura + миграция persisted `theme-store.ts`, `layout.tsx`, `ThemeProvider.tsx`
- `THEMES` = `['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal']`; `Theme`-union сузился → это превратило каждое `=== 't-scandi'` в **ошибку tsc** (TS2367) — точный чеклист для чистки TSX.
- `theme: 't-aura'` дефолт; экспортированы `DEFAULT_THEME`, `LEGACY_THEMES`.
- **Три уровня миграции** сохранённой темы:
  1. `persist({ merge })` в сторе — устаревшая/неизвестная тема → `t-aura`.
  2. `ThemeProvider` guard — `!THEMES.includes(theme)` → `setTheme(DEFAULT_THEME)`.
  3. inline `theme-init` в `layout.tsx` — применяет класс на `<html>` до гидрации **только если** тема ∈ валидного списка из 6; scandi/paper/sand/мусор → остаётся дефолтный `t-aura` (нет вспышки).
- SSR-класс `<html>`: `t-scandi` → `t-aura`. Шрифт **Inter** убран (использовался только scandi через `--font-app`).

### C2 — вынос глобальных правил из `.t-scandi`
Три правила физически жили внутри scandi-блока, но были **глобальными** (не `.t-scandi`-scoped):
`[data-modal-overlay]/[data-modal]` z-index, `@keyframes modalIn` + `[role="dialog"]` + reduced-motion, reminder-toast `[style*="translateX"]` reduced-motion. Вынесены в новый блок **`SHARED GLOBALS`** в `globals.css` перед удалением scandi-региона.

### C3 — add-on-hover глобально
Было `.t-scandi .add-on-hover, .t-aura .add-on-hover`. Стало **вне тем**:
```css
.add-on-hover { color: transparent; transition: color 150ms ease; }
tr:hover .add-on-hover, tr:focus-within .add-on-hover { color: var(--text-mute); cursor: pointer; }
```
Добавлен `tr:focus-within` (a11y — доступно с клавиатуры). Теперь ghost-CTA «+ добавить» скрыт по умолчанию и показывается на hover/focus строки во **всех** темах.

### C4 — удалено paper/sand
Токен-блоки `.t-paper`/`.t-sand`, декорации (`.t-paper body::before`, `.t-sand header`), записи в `Header`/`ContentHeader`/`SettingsContent` theme-списках.

### C5 — удалено scandi + переименование shell
- Токен-блок `.t-scandi` (+ dark `@media`), ~146 `.t-scandi …`-селекторов, `.t-scandi .focus-day-card`, а также **разбросанные** позже по файлу правила (`.t-scandi .bg-yellow`, `.t-scandi table … [data-kbd-focused]`, `.t-scandi .kbd-focus-row`, `.t-scandi .peek-panel`).
- **SCANDI_-константы и isScandi-ветки** вычищены в: `DashboardHome` (SCANDI_KPI_META, ScandiStatCard, VIVID_FUNNEL, hero-branch), `PipelineBoard` (SCANDI_HERO_WM, SCANDI_PHASE_WM, ScandiHeroCard→HeroCard), `Charts` (SCANDI_MONO_LANE, VIVID_LANE, VIVID_PHASE, active/hovered), `TasksSidebar` (SCANDI_SIDEBAR_WM, ScandiWidgetWrap), `CTAButton`, `PageHeader`, `KanbanBoard`, `AnalyticsPage`, `CalendarView`, `ProjectCard`, `ProjectDetail`, `CallsChart`. Ветки схлопнуты в non-scandi (aura/дефолт) путь; осиротевшие импорты (`Bracket`, `Watermark`, `cn`, `useState`, `useThemeStore`) убраны.
- `ScandiSidebar→TextNavSidebar`, `ScandiContentHeader→ContentHeader` (git-mv + переименование экспортов).

### C6 — единый shell для всех тем `(dashboard)/layout.tsx`
- Убрано ветвление `isTextNav`: **все** темы рендерят `TextNavSidebar` + `ContentHeader` (внутри `<main>`). Отступ всегда `ml-[232px]/ml-14`, drawer-margin без гейта темы.
- `Header` (верхний бар) и иконочный `Sidebar` больше не рендерятся → файлы удалены.
- `ActivityDrawer`: снят гейт `if(!isTextNav) return null` — drawer рендерится всегда (видимость по `drawerStore.isOpen`).
- Это устраняет hydration-mismatch: SSR и клиент рендерят одно дерево для любой темы.

---

## 3. Верификация

| Проверка | Результат |
|---|---|
| `tsc --noEmit` | ✓ 0 ошибок |
| `next build` | ✓ Compiled + types valid, 19/19 страниц |
| `python3 scripts/audit-contrast.py` | ✓ **0 FAIL** для aura/washi/fuji/frost/aurora/tidal (38–41 пар/тема) |
| `vitest run` | ✓ 102/102 (13 файлов) |
| `grep -r "t-scandi\|t-paper\|t-sand\|SCANDI_" src` | 0 (кроме `LEGACY_THEMES` — намеренно) |
| Баланс скобок `globals.css` | 330 `{` / 330 `}` |

`scripts/audit-contrast.py` обновлён под 6 тем: убраны scandi/paper/sand из `theme_selectors`, снят разбор scandi-dark `@media` и scandi-outline/scandi-dark-yellow override-ветки.

---

## 4. Отклонения и находки

1. **Scandi-правила были разбросаны** не только в 752–1351, но и позже по файлу
   (bg-yellow, kbd-focus-row, peek-panel, `data-kbd-focused`). Все вычищены — первый
   grep после блочного удаления это выявил.
2. **`.t-scandi` дефолт-токены жили в `:root`** (комментарий «Claude, default light»), а
   `.t-scandi`-блок был чисто стилевым override. Дефолт-токены (light) остались базой
   каскада для всех тем — их не трогали.
3. **`ui/WatermarkNew.tsx` осиротел полностью** — все его использования были
   scandi-gated. Удалён (не только `ui/Watermark.tsx`).
4. **Переименованы также `ScandiHeroCard→HeroCard`, удалён `ScandiWidgetWrap`** —
   промт их явно не называл, но `Scandi`-нейминг в коде убран для консистентности.

---

## 5. НЕ сделано / требует человека

1. **Живой визуальный регресс-прогон по 6 темам — ОБЯЗАТЕЛЕН и НЕ выполнен.**
   Промт помечает его как гейт («визуальный регресс-прогон по 6 темам обязателен»),
   а Chrome в этой сессии не залогинен. Нужно вручную прогнать тест-сценарии §6.
2. **Мёртвый CSS сайдбара washi/fuji.** `.t-washi/.t-fuji aside .nav-item` и
   `.nav-active` таргетили классы **старого** иконочного `Sidebar`. `TextNavSidebar`
   помечает пункты атрибутами `data-nav-item`/`data-active` (не классами) — значит эти
   ~22 селектора теперь **не матчат ничего** (безвредны, но cruft). Фон/цвета `aside`
   (`.t-washi aside {…}`, `.t-washi aside .text-text-main`) — по-прежнему применяются.
   Активный пункт в тёмных темах падает на JS-фолбэк `TextNavSidebar` (2px-линия
   `var(--text)`), пилюля — только у aura (`.t-aura aside nav a[data-active]`).
   → **Follow-up:** после визуального прогона решить — до-стилизовать общий скелет под
   тёмные темы или снести мёртвые `.nav-item`/`.nav-active` washi/fuji.
3. **Коммиты не сделаны.** Промт предлагает 3 коммита (C1 / C2-3 / C4-6!). Оставил на
   Олега, т.к. §5.1 — человеческий гейт. Предлагаемая разбивка:
   ```
   feat(themes): дефолт aura + миграция persisted (AUDIT C1)
   refactor(themes): глобальные правила вынесены из scandi; add-on-hover на row-hover глобально (AUDIT C2-3)
   feat(themes)!: удалены scandi/paper/sand; единый shell TextNavSidebar для всех тем (AUDIT C4-6)
   ```

---

## 6. Тест-сценарии (статус)

| # | Сценарий | Статус |
|---|---|---|
| 1 | Чистый localStorage → первый рендер aura, без вспышки/hydration-warning | ⏳ нужен браузер (логика: SSR-класс `t-aura` + inline-init) |
| 2 | localStorage `t-scandi` → авто-миграция на aura | ⏳ нужен браузер (3 уровня миграции, §C1) |
| 3 | 6 тем: переключение, непрозрачные модалки, z-index, reduced-motion | ⏳ **регресс-прогон** (audit 0 FAIL — статически) |
| 4 | Таблица с пустыми ячейками: ghost-CTA только на hover/focus строки, во всех темах | ⏳ нужен браузер (правило `.add-on-hover` глобально) |
| 5 | Навигация идентична во всех темах (один shell) | ⏳ нужен браузер (см. §5.2 про washi/fuji) |
| 6 | `tsc/build` зелёные; grep scandi/paper/sand/SCANDI_ = 0 | ✅ **выполнено** |

---

## 7. Изменённые файлы

```
scripts/audit-contrast.py                     +/-  (6 тем, убраны scandi-override-ветки)
src/lib/stores/theme-store.ts                 THEMES/Theme/default/merge-миграция
src/app/layout.tsx                            SSR-класс t-aura, inline-init валид-лист, Inter убран
src/app/(dashboard)/layout.tsx                единый shell (TextNavSidebar + ContentHeader)
src/app/globals.css                           −667 строк (scandi/paper/sand + SHARED GLOBALS)
src/components/layout/ThemeProvider.tsx        fallback → DEFAULT_THEME
src/components/layout/TextNavSidebar.tsx       ← ScandiSidebar (rename)
src/components/layout/ContentHeader.tsx        ← ScandiContentHeader (rename)
src/components/layout/ActivityDrawer.tsx       снят theme-гейт
src/components/layout/Header.tsx               УДАЛЁН
src/components/layout/Sidebar.tsx              УДАЛЁН
src/components/ui/Watermark.tsx                УДАЛЁН
src/components/ui/WatermarkNew.tsx             УДАЛЁН
src/components/ui/CTAButton.tsx                схлопнут в accent-кнопку
src/components/layout/PageHeader.tsx           схлопнут в h1-путь
src/components/dashboard/DashboardHome.tsx     −127 (SCANDI_KPI_META, ScandiStatCard, ветки)
src/components/projects/PipelineBoard.tsx      SCANDI_*_WM, ScandiHeroCard→HeroCard
src/components/analytics/Charts.tsx            SCANDI_MONO_LANE/VIVID_*, active/hovered
src/components/analytics/CallsChart.tsx        isScandi-fill убран
src/components/analytics/AnalyticsPage.tsx     h1-путь
src/components/tasks/KanbanBoard.tsx           h1-путь
src/components/widgets/TasksSidebar.tsx        SCANDI_SIDEBAR_WM, ScandiWidgetWrap
src/components/calendar/CalendarView.tsx       scandi-Watermark убран
src/components/projects/ProjectCard.tsx        scandi visual-weight убран
src/components/projects/ProjectDetail.tsx      dead isScandi убран
src/components/settings/SettingsContent.tsx    theme-список 6 тем
```

**VERIFICATION (факт):** Type Safety ✅ | RLS N/A | Backward Compat ✅ (миграция persisted, статически) | Runtime ⚠️ **NOT_VERIFIED** — визуальный регресс-прогон по 6 темам обязателен (§5.1).
