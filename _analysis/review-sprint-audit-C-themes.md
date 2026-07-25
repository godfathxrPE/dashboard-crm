# Ревью: sprint-audit-C-themes — «Темы: дефолт aura, минус три темы, один shell»

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect `schema.md` / `architecture.md` / `learnings.md` / `theme-system.md`)  
**Объект:** `_analysis/sprint-audit-C-themes.md` — дефолт `t-aura`, удаление scandi/paper/sand, глобальный add-on-hover, единый shell  
**Контекст:** AUDIT-2026-07-12 (1П-2, 1П-3, 2П-4, 2.8 + «стоимость удаления»). Предшественники A1/A2 уже на `main`. Follow-up: C7 (icon-nav), washi-fix, UI-D1 (скобки). Результаты: `sprint results/RESULTS-audit-C-themes.md` (2026-07-13).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз аудита (1П-2 / 1П-3 / 2П-4 / 2.8) | ✅ верный **на момент** AUDIT-2026-07-12 |
| Порядок задач (C1 → C2 → C3 → C4–6) | ✅ жёсткий порядок был правильным |
| РАЗВЕДКА / пути / line numbers (актуальность на `main`) | ❌ **полностью устарели** — работа уже влита |
| Schema / RLS / миграции SQL | ✅ NOT_APPLICABLE — корректно |
| learnings.md / theme-system.md | ✅ post-C состояние уже задокументировано |
| architecture.md (shell, THEMES) | ✅ описывает **после** AUDIT C, не «до» |
| Безопасность повторного запуска в CC | ❌ **не запускать** — no-op / риск регрессии |

**Оценка: 3/10 как handoff «запусти сейчас».**  
Как *исторический* дизайн-спек до реализации — было ~9/10 (чёткий порядок, миграция persisted, вынос глобалей до удаления CSS). Как живой промпт для Claude Code на текущем `main` — **непригоден**.

**Рекомендация:** **не запускать в CC.** Спринт закрыт коммитом `313d512` (+ follow-up C7/washi/D1). При необходимости — только микро-чистка комментариев «ScandiSidebar» в `globals.css`, не переигрывать C целиком.

---

## Статус реализации (факт репо)

| Задача спринта | Статус на `main` | Доказательство |
|----------------|------------------|----------------|
| C1. дефолт → `t-aura` + миграция persisted | ✅ сделано | `theme-store.ts:4–10,32–37`; `layout.tsx:52,64–69`; `ThemeProvider.tsx:10–13` |
| C2. глобальные правила из `.t-scandi` | ✅ сделано | `globals.css:631–670` (`SHARED GLOBALS — AUDIT C2/C3`) |
| C3. `.add-on-hover` глобально + `:focus-within` | ✅ сделано | `globals.css:658–670` |
| C4. удалить paper/sand | ✅ сделано | `grep -c t-scandi\|t-paper\|t-sand globals.css` → **0** |
| C5. удалить scandi + rename shell | ✅ сделано | `TextNavSidebar.tsx`, `ContentHeader.tsx`; `Sidebar.tsx`/`Header.tsx`/`Scandi*` — **нет файлов** |
| C6. единый shell, без ветвления по теме | ✅ сделано | `(dashboard)/layout.tsx:52–68` — всегда `TextNavSidebar` + `ContentHeader` |
| Inter только для scandi | ✅ не грузится | `layout.tsx`: Onest/Unbounded/Manrope/Plex/Geist; Inter отсутствует |
| Коммиты из спринта | ✅ уже есть | `313d512` (сообщение ≈ C4–6 + C1 в одном breaking); follow-ups отдельно |
| VERIFICATION grep = 0 | ✅ (кроме намеренного LEGACY) | `LEGACY_THEMES` в store — **нужен** для миграции |

Ключевые коммиты:

| SHA | Сообщение |
|-----|-----------|
| `313d512` | `feat(themes)!: AUDIT C — дефолт aura, удалены scandi/paper/sand, единый shell TextNavSidebar` |
| `3ffbcac` | orphaned `.t-<theme> header` rules (регрессия C6) |
| `e11a098` | washi jpLabel + Torii в TextNavSidebar (C6 follow-up) |
| `f3aa704` | C7: icon-nav для всех тем кроме aura |
| `a709ba6` | UI-D1: убраны декор-скобки (реликт scandi) |

Отчёт исполнителя: `sprint results/RESULTS-audit-C-themes.md` (2026-07-13) — tsc/build/vitest/contrast по 6 темам, **спринт закоммичен**.

`architecture.md` / `learnings.md` / `theme-system.md` уже описывают post-C мир: 6 тем, дефолт `t-aura`, `LEGACY_THEMES`, `TextNavSidebar`/`ContentHeader`, «Sidebar/Header удалены в AUDIT C».

---

## РАЗВЕДКА: факт vs ожидания спринта

Команды из промпта на текущем `main`:

| Команда / claim | Результат сейчас | Вывод |
|-----------------|------------------|--------|
| `grep scandi` theme-store / ThemeProvider / layout | только **комментарии** + `LEGACY_THEMES` | C1/C5 done |
| `ScandiSidebar\|Sidebar` в dashboard layout | только `TextNavSidebar` import/usage | C6 done; старого ветвления нет |
| `grep -c t-scandi\|t-paper\|t-sand globals.css` | **0** | C4–5 done |
| `SCANDI_` в `src/**/*.ts*` | **0 файлов** | C5 done |
| `add-on-hover` / `modalIn` / reduced-motion / z-index | глобальный блок ~631–670 | C2–3 done |
| `THEMES` в `src/lib` | `theme-store.ts` — 6 тем | C1 done |
| Путь `src/components/providers/ThemeProvider.tsx` | **не существует**; реальный путь: `src/components/layout/ThemeProvider.tsx` | разведка **битая** |
| Строки `:1305-1313` (per-theme add-on-hover) | неактуальны; файл короче, правило глобальное | stale line numbers |
| «~620 строк `.t-scandi`», «74 TSX», «~150 SCANDI_*» | целевое состояние «до» — уже вычищено | inventory для CC пустой |
| «ПОСЛЕ A1/A2» | A1 (`a37370f`/`13c9bb8`), A2 (`b01919d`/…) **уже на main** | precondition выполнено давно |

Повторный прогон РАЗВЕДКИ **не найдёт** объектов для правок C2–C6; CC либо no-op, либо начнёт «чинить» несуществующее (rename уже переименованного, удаление уже удалённого).

---

## С чем согласен полностью (как с планом до реализации)

### 1. Порядок C1 → C2 → удаление

Сначала дефолт + миграция persisted, **потом** вынос глобалей из `.t-scandi`, **потом** удаление CSS/TSX. Иначе первый рендер и модалки ломаются. Это совпадает с AUDIT 1П-2 и «стоимостью удаления».

### 2. Миграция legacy в store + theme-init

`LEGACY_THEMES` + `merge` в persist + whitelist в inline `theme-init` — правильный паттерн (FOUC + hydration). В коде:

- store: `valid = THEMES.includes(t) && !LEGACY_THEMES.includes(t)` → иначе `DEFAULT_THEME`
- `theme-init`: whitelist `V=[t-aura…t-tidal]`; иначе остаётся SSR-класс `t-aura`

### 3. Глобальный `.add-on-hover` (1П-3)

Одно правило вне тем + `tr:focus-within` (a11y) — верно. Per-theme исключения scandi/aura убраны.

### 4. Единый shell против hydration 2.8

Ветвление JSX по persisted-теме → SSR ≠ client. Фикс: одно дерево (`TextNavSidebar` + `ContentHeader`); темы = токены/CSS, не скелет. C7 **сохранил** это ограничение (иконки всегда в DOM, aura прячет `.nav-ico` CSS-ом) — см. `sprint-audit-C7-darknav.md`.

### 5. Не миграционный спринт

SQL/RLS/`schema.md` не трогаем. VERIFICATION: Type Safety WARNING, RLS N/A, visual regress по 6 темам — адекватно.

### 6. Breaking commit с `!`

Удаление тем + rename shell = breaking для localStorage/скриншотов — `feat(themes)!` уместен.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже выполнен на `main` — повторный прогон опасен

Весь скоуп C1–C6 закрыт `313d512` (29 файлов, нетто ~−1451 LOC) + follow-ups. Промпт говорит «удалить Sidebar», «переименовать ScandiSidebar», «вырезать 620 строк scandi» — этих артефактов **уже нет**. Claude Code по такому handoff:

- либо invents diffs на пустом месте,
- либо откатывает post-C7/D1 улучшения, пытаясь «восстановить» единый text-nav без icon-nav.

**Не запускать.**

### B2. РАЗВЕДКА и inventory не соответствуют live-коду

| Claim спринта | Live |
|---------------|------|
| `ThemeProvider` в `providers/` | файл в `layout/ThemeProvider.tsx` |
| дефолт / сравнение с `'t-scandi'` | дефолт уже `t-aura`; scandi только в `LEGACY_THEMES` |
| ветвление shell в layout | всегда `TextNavSidebar` (комментарий AUDIT C6) |
| 3 TSX-упоминания paper/sand (Header, ScandiContentHeader, Settings) | Header/Scandi* удалены/переименованы; Settings — 6 тем без paper/sand |
| Inter убрать если только scandi | Inter уже не в layout |

Без обновления разведки CC будет править ghost-paths.

### B3. architecture.md / learnings уже post-C — «источник истины» спринта устарел

Промпт написан **до** реализации; skill-референсы обновлены **после**. Если CC сверится с architecture («Sidebar.tsx удалён», «6 тем»), а промпт прикажет «удалить scandi / rename ScandiSidebar» — конфликт инструкций. Победит хаос, не план.

---

## Предупреждения (не блокируют «закрытие», но полезны)

### W1. Коммиты спринта ≠ фактическая нарезка

Промпт: минимум 3 коммита (C1 / C2–3 / C4–6). Факт: один breaking `313d512` + отдельные follow-ups. Для истории ок; при «перепрогоне» по списку коммитов CC создаст дубликаты сообщений.

### W2. C6 text-only shell → регресс, закрытый C7

C6 снял icon-Sidebar; C7 (`f3aa704`) вернул icon-nav **внутри** единого `TextNavSidebar` (кроме aura). Запуск исходного C «как есть» может снова снести C7-интент, если CC буквально сделает «все темы на text caps nav».

### W3. Мёртвые комментарии «Scandi*» в CSS

`globals.css:972` («ScandiSidebar помечает…»), `:1013` («Header (ScandiContentHeader)»), `:1343` («Scandi обрабатывается…») — косметика, не runtime. Не повод переигрывать спринт.

### W4. `SettingsContent` дублирует список тем

Локальный `THEMES` в `SettingsContent.tsx:19–26` (id+label+color) vs `THEMES` из store (только id). Работает, 6 тем совпадают; единый source of truth — nice-to-have, вне scope C.

### W5. `ThemeProvider` guard vs store `merge`

Оба мигрируют invalid theme → `DEFAULT_THEME`. Избыточность безопасна (belt-and-suspenders), не баг.

### W6. Дата user_info vs RESULTS

RESULTS датирован 2026-07-13; review 2026-07-16. Спринт-файл без статуса «done» — выглядит как pending для watcher’а, хотя код закрыт. Имеет смысл пометить в `_analysis` или удалить/архивировать промпт, чтобы auto-review не поднимал его снова.

---

## Пропущенные места (grep gaps для *повторного* C)

Для **первичного** прогона inventory был полный (RESULTS: 26+ файлов). Для **повторного** — gaps = 0 actionable targets, кроме:

| Файл | Строки | Действие |
|------|--------|----------|
| `src/app/globals.css` | ~972, 1013, 1343 | optional: переименовать комментарии Scandi* → TextNav/ContentHeader |
| `src/lib/stores/theme-store.ts` | 9 | **не трогать** `LEGACY_THEMES` — нужен для migration |
| `_analysis/sprint-audit-C-themes.md` | — | пометить DONE / не отдавать в CC |

---

## Предлагаемые правки в спринт

1. **В шапку:** `СТАТУС: DONE (313d512, 2026-07-13). Не запускать. См. sprint results/RESULTS-audit-C-themes.md`.
2. **Не править** task-list «как будто work pending» — либо архив в `_to_delete/`, либо one-liner status.
3. Если нужен «чистый» follow-up: отдельный 5-минутный handoff «rename scandi comments in globals.css» — **не** этот файл.
4. Живая тема-работа: смотреть **C7** и visual regress по washi/fuji, не C.

---

## Чеклист crm-architect (condensed)

- [x] Есть РАЗВЕДКА (но **stale** на live)
- [x] Нет SQL/угаданных table names
- [x] Пути layout/store в целом верные; **ThemeProvider path — нет**
- [x] learnings: CSS variables, theme class на html, opaque surfaces — не нарушены планом
- [x] Миграции SQL: N/A; apply from CC: N/A
- [x] org_id/RLS: N/A
- [x] SECURITY DEFINER: N/A
- [x] `flowType: 'implicit'`: N/A
- [x] DELETE CASCADE: N/A
- [x] CSS: variables + theme class (план и код)
- [x] schema.md update: N/A

---

## Чеклист перед CC

- [x] Убедиться, что C **уже** на `main` (`git show 313d512`, `theme-store THEMES`)
- [x] **Не** запускать этот промпт в Claude Code
- [ ] (optional) Пометить sprint-файл DONE или перенести в archive
- [ ] (optional) Косметика комментариев Scandi* в `globals.css`
- [ ] Новые theme-задачи — только через C7/D1/отдельный sprint, не через C

---

## Итог одной строкой

**AUDIT-C полностью реализован и верифицирован; handoff — архивный документ. Запуск в CC запрещён.**
