# Ревью: sprint-audit-C7-darknav — icon-nav для всех тем кроме aura

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `6d86d37`, crm-architect `schema.md` / `architecture.md` / `learnings.md` / `theme-system.md`)  
**Объект:** `_analysis/sprint-audit-C7-darknav.md` — регресс-фикс C6: иконки/NavBadge/лого-акцент/живые nav-CSS washi+fuji в едином `TextNavSidebar`, aura без иконок через CSS  
**Контекст:** AUDIT C (`313d512`) → orphaned header cleanup (`3ffbcac`) → washi jpLabel/scramble (`e11a098`) → **C7 (`f3aa704`, 2026-07-13)** → UI-D1 скобки (`a709ba6`). Sibling-ревью: `_analysis/review-sprint-audit-C-themes.md` уже ссылается на C7 как follow-up.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Архитектурное ограничение (один shell, иконки всегда в DOM, aura CSS-hide) | ✅ верно и **уже соблюдено** |
| Диагноз багов C6 (washi hover, NavBadge, лого, text-sm/gap) | ✅ был верным **на момент pre-C7** |
| РАЗВЕДКА / «текущее состояние» vs live `main` | ❌ **полностью устарело** — C7 влит |
| Пути / git-эталоны (`313d512^:Sidebar.tsx`, TextNavSidebar, globals) | ✅ SHA и пути валидны как **история** |
| Schema / RLS / SQL-миграции | ✅ NOT_APPLICABLE |
| learnings.md / theme-system.md / architecture.md | ✅ post-C7 состояние уже описано |
| Безопасность повторного запуска в CC | ❌ **не запускать** — no-op / риск лишних правок |

**Оценка: 3/10 как handoff «запусти сейчас».**  
Как *исторический* дизайн-спек до `f3aa704` — было ~9/10 (чёткий single-shell constraint, точный перечень багов, git-эталоны, не трогать header-CSS). Как живой промпт на текущем `main` — **непригоден**.

**Рекомендация:** **не запускать в CC.** Спринт закрыт коммитом `f3aa704` (message = commit-строка спринта). Визуальный residual (если есть) — отдельный micro-sprint по скринам, не переигрывать C7.

---

## Статус реализации (факт репо)

| Задача спринта | Статус на `main` | Доказательство |
|----------------|------------------|----------------|
| Z1. `icon` + `sectionColor` в nav-конфиг | ✅ | `TextNavSidebar.tsx:22–39` — Sun/LayoutDashboard/…/Settings |
| Z1. `.nav-ico` всегда в DOM, aura hide CSS | ✅ | TSX:140–143; `globals.css:1003–1005` `.t-aura .nav-ico { display: none }` |
| Z1. gap-3 / px-3 py-2 / `text-sm` / icon size 20 | ✅ | `TextNavSidebar.tsx:131–142` |
| Z1. лого TC `bg-accent text-white h-8 w-8` + «Torii CRM» (не-aura) | ✅ | `TextNavSidebar.tsx:176–194` |
| Z2. `NavBadge` + badgeKey tasks/leads/calls | ✅ | `TextNavSidebar.tsx:41–52, 106–114, 149` |
| Z3. washi/fuji aside/nav-item/hover/active/brackets | ✅ | `globals.css:259–329` (washi), `429–522` (fuji); header-блоки **не** возвращены (коммент C6) |
| Z3. frost/aurora/tidal — токены, без второго shell | ✅ | токены `--sidebar-*` в темах; отдельных aside-override нет (как и в старом Sidebar — token-driven) |
| Z4. washi scramble / WashiNavLabel | ✅ | `TextNavSidebar.tsx:54–66, 146–148`; `use-text-scramble.ts` |
| Единый shell, без ветвления JSX по теме | ✅ | `(dashboard)/layout.tsx:68` — всегда `<TextNavSidebar />`; `isAura`/`isWashi` только для **классов/контента внутри** одного дерева |
| Коммит спринта | ✅ | `f3aa704` — message **байт-в-байт** = «КОММИТ» из спринта |
| Гейты (tsc/vitest/contrast) | ✅ (по commit body) | «tsc/lint, vitest 102/102, contrast-audit 0 FAIL ×6»; live-скрины — «за Олегом» |
| Отдельный `RESULTS-*C7*` | 🟡 | нет; артефакт = commit message `f3aa704` + код |

Ключевые SHA:

| SHA | Роль |
|-----|------|
| `313d512` | AUDIT C — единый shell, удаление Sidebar/Header |
| `3ffbcac` | снос orphaned `.t-<theme> header` (C6) — **не возвращать** |
| `e11a098` | washi jpLabel+scramble + Torii в TextNavSidebar |
| **`f3aa704`** | **C7 — этот спринт, DONE** |
| `a709ba6` | UI-D1 — декор-скобки `.bracket` (не nav-active washi/fuji) |

`Sidebar.tsx` **отсутствует** (`src/components/layout/` — только TextNavSidebar и др.). Эталон только в git: `313d512^:src/components/layout/Sidebar.tsx`.

---

## РАЗВЕДКА: факт vs ожидания спринта

| Claim / команда спринта | Результат сейчас | Вывод |
|-------------------------|------------------|--------|
| `git show 313d512^:…/Sidebar.tsx` | файл читается; NavBadge, icons, sectionColor, hover:text-text-main | эталон **валиден** |
| `cat TextNavSidebar.tsx` как «до C7» | файл **уже post-C7**: icons, NavBadge, logo-accent, scramble, nav-ico | разведка **врёт про «текущее»** |
| «пропали красные бейджи» | `NavBadge` на месте (`:41–52, :149`) | fixed |
| «пропал акцент на TC-лого» | `bg-accent text-white rounded-md h-8 w-8` (`:181–183`) | fixed |
| washi hover → чёрный текст | `.t-washi aside .nav-item:hover { color: rgba(232,226,216,0.9) !important }` (`globals.css:277–279`) перекрывает Tailwind `hover:text-text-main` | fixed (паттерн как в старом) |
| «мелкий text-sm» | уже `text-sm` + `gap-3` + `px-3 py-2` + icon 20 | fixed |
| `.t-aura .nav-ico { display:none }` | `globals.css:1005` + comment AUDIT C7 | fixed |
| Header-правила не возвращать | washi/fuji: только `aside`; header-блок снесён с явной пометкой C6 | ✅ |
| Sliding indicator (JS) из старого Sidebar | **не** перенесён; washi/fuji = `::before/::after` на `.nav-active` | **вне scope C7**, ок |
| `diff f3aa704..HEAD` TextNavSidebar | **пустой** по TSX (файл не менялся после C7) | реализация стабильна |

Повторный прогон задач Z1–Z4 **не найдёт** дыр под «вернуть иконки» — код уже совпадает с целевым состоянием. CC либо no-op, либо начнёт «улучшать» (дубли CSS, смена data-active, второй shell).

---

## С чем согласен полностью (как с планом до реализации)

### 1. Единый shell + CSS-кожа (hydration 2.8)

«Иконки ВСЕГДА в DOM; aura прячет `.nav-ico` CSS-ом; никакого второго Sidebar и никакого ветвления JSX-структуры по persisted-теме» — правильный фикс после C6. Совпадает с `architecture.md` / `theme-system.md` / learnings (store value = `t-aura`, не `'aura'`).

### 2. Корневая причина washi-hover

На sumi-сайдбаре Tailwind `hover:text-text-main` тянет **page**-токен `--text` (#2C2C2C) → чёрный на тёмном. Лечение — theme-scoped `.t-washi aside .nav-item:hover` с `!important` и light ivory. В коде это есть.

### 3. Header CSS не возвращать

`3ffbcac` снёс `.t-<theme> header` осознанно (тёмный бар за page-header). C7 правильно ограничивает scope **aside/nav**.

### 4. git-история как эталон

`313d512^:Sidebar.tsx` + старые washi/fuji aside-правила — корректный способ не угадывать разметку. NavBadge, badgeKey, icon set — совпадают с текущим post-C7 кодом.

### 5. Washi scramble не ломать

Иероглиф + icon + badge в одном item; scramble через `useTextScramble` — сохранено (`e11a098` + C7 не вырезали).

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт описывает pre-C7 мир как «текущий»

Контекст спринта: «C6 снёс… washi-фикс вернул jpLabel, но НЕ визуальный язык… пропали бейджи/лого/hover».

На `main` **после `f3aa704`** это уже не так. Запуск CC «как есть» = работа по закрытому backlog.

**До запуска (если когда-либо понадобится residual-fix):** в шапку спринта добавить:

```text
СТАТУС: DONE (f3aa704, 2026-07-13). Не запускать.
Гейты: tsc/lint/vitest 102/102/contrast ×6 — в commit body.
Live-скрины 6 тем — follow-up визуальной приёмки, не re-implement.
```

### B2. Commit message спринта = уже существующий SHA

Строка «КОММИТ» **идентична** `f3aa704`. Повторный commit с тем же intent — дубль истории / force-rewrite temptation. Не коммитить повторно.

---

## Предупреждения (желательно, не блокеры для «не запускать»)

### W1. Нет отдельного RESULTS-файла для C7

Есть `sprint results/RESULTS-audit-C-themes.md`, нет `RESULTS-audit-C7-*`. Доказательства — commit body + код. Для архива достаточно; для ритуала sprint-results — опционально дописать 5–10 строк.

### W2. Stale-комментарии (не функционал)

| Место | Замечание |
|-------|-----------|
| `(dashboard)/layout.tsx:52–53` | «вертикальное **текстовое** меню» — post-C7 shell icon+text (кроме aura) |
| `globals.css:972` | «ScandiSidebar помечает…» — файл переименован |
| `architecture.md` legacy Sidebar | «Sliding indicator animation» — JS-indicator не в TextNavSidebar |

Чистка комментариев — micro-chore, не C7.

### W3. Селектор лого-текста washi/fuji частично legacy

CSS: `.t-washi aside .text-sm.font-semibold` — у текущего лого `text-[13px] font-medium text-text-main`. Цвет лого **всё равно** ловится через `.text-text-main` (`globals.css:268–269`). Не баг, но селектор `text-sm.font-semibold` мёртвый для лого.

### W4. Tailwind hover-классы остаются на Link

`hover:text-text-main hover:bg-surface2` всё ещё на item (`:135`). Для washi/fuji перекрыто `!important` theme CSS; для frost/aurora/tidal — token-driven (тёмный surface, светлый text). Спринт просил «проверить живьём» — commit body говорит contrast-audit 0 FAIL; live-скрины Олега — единственный незакрытый human-gate.

### W5. Sliding indicator старого Sidebar не в scope

Старый Sidebar имел JS sliding pill (`--sidebar-indicator`). C7 его **не** требует; washi/fuji = torii-brackets на `.nav-active`. Не считать gap'ом C7, если visual QA не попросит вернуть pill для frost/aurora/tidal.

### W6. `isAura` / `isWashi` из store — не hydration-ветвление структуры

Спринт запрещает ветвление **структуры** по теме. В коде `isAura` меняет классы лого/лейбл-текст, `isWashi` — WashiNavLabel vs span. Иконки и DOM-скелет item **общие**. Это допустимо и совпадает с C7-intent (hydration 2.8 = разный *tree*, не разный *copy* внутри).

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| — | — | **Нет missed files для Z1–Z4** — целевое состояние уже в `TextNavSidebar.tsx` + `globals.css` |
| `src/components/layout/Sidebar.tsx` | — | **не существует** — не восстанавливать файл |
| `src/app/(dashboard)/layout.tsx` | 52–53 | только комментарий (W2) |
| crm-architect `architecture.md` | 152–170 | docs уже post-C7; legacy note про indicator — косметика |

Schema.md: таблицы/колонки/RPC **не задействованы** — чеклист SQL/RLS N/A.

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в начале | ✅ есть (но **выводы** устарели post-`f3aa704`) |
| Реальные table/column | ✅ N/A |
| Реальные file paths | ✅ `TextNavSidebar.tsx`, `globals.css`, git `313d512^` |
| learnings gotchas (темы, `t-` prefix, CSS vars) | ✅ соблюдены |
| SQL migrations / apply from CC | ✅ нет SQL |
| org_id / RLS | ✅ N/A |
| SECURITY DEFINER | ✅ N/A |
| no `flowType: 'implicit'` | ✅ N/A |
| DELETE CASCADE | ✅ N/A |
| CSS: variables, theme-scoped | ✅ washi/fuji aside + `.t-aura .nav-ico` |
| schema.md after migration | ✅ N/A |

---

## Предлагаемые правки в спринт

1. **Шапку:** `СТАТУС: DONE (f3aa704, 2026-07-13). Не запускать в CC.`
2. **Контекст** переписать в прошедшем времени: «на момент post-C6 / pre-C7…; исправлено в f3aa704».
3. **РАЗВЕДКА:** добавить verification-команды post-done:
   - `rg -n "nav-ico|NavBadge|function NavBadge" src/components/layout/TextNavSidebar.tsx`
   - `rg -n "t-aura .nav-ico|nav-item:hover" src/app/globals.css`
   - `git log -1 --oneline f3aa704`
4. **Не** менять commit message / не просить повторный commit.
5. Если visual QA найдёт residual — новый sprint `sprint-audit-C7b-…` со скрин-диффами, не re-open C7.

---

## Чеклист перед CC

- [ ] **Не запускать C7** — реализация на `main` (`f3aa704`)
- [ ] При сомнении: сравнить `TextNavSidebar.tsx` с телом `git show f3aa704` (ожидание: совпадение intent)
- [ ] Live-приёмка 6 тем (человеческий gate) — отдельно от CC, если ещё не закрыта скринами
- [ ] Новые theme-правки — только новый sprint, не этот файл
- [ ] Не восстанавливать `Sidebar.tsx` / header-CSS / второй shell
- [ ] Не коммитить и не править sprint-файл без явной просьбы

---

**Итог:** C7 — **закрытый** регресс-фикс C6. Архитектура спринта была правильной; код и crm-architect refs уже отражают post-C7 мир. Claude Code по этому промпту **не запускать**.
