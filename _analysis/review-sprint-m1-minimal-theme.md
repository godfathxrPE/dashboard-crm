# Ревью: M1 — тема Minimal (`t-minimal`, v1.1)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `8ffee6d`, live grep/read + `python3 scripts/audit-contrast.py`)  
**Объект:** `_analysis/sprint-m1-minimal-theme.md` (v1.1) — 7-я светлая тема: Inter, нейтральный canvas, терракотовый акцент  
**Контекст:** client-only theme system; без миграций БД. Предыдущее ревью (B1 ContentHeader, B2 `audit-contrast.py`) учтено в v1.1. **Реализация уже в HEAD** (`8ffee6d feat(themes): новая тема Minimal…`).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (store / FOUC / settings / header / fuji / audit) | ✅ пути и символы верны |
| v1.1 vs блокеры прошлого ревью (B1/B2) | ✅ закрыты в промпте и в коде |
| Палитра / WCAG (ручной + `audit-contrast.py`) | ✅ `t-minimal: 0 FAIL of 38` |
| `--font-app` only (learnings / theme-system) | ✅ |
| Token set vs `.t-aura` (surfaces, *-text, tracks, A11Y fills) | ✅ |
| `Record<Theme>` / ContentHeader | ✅ |
| `theme_selectors` + git add список | ✅ |
| Точка вставки CSS (якорь РАЗВЕДКИ №5) | 🟡 неоднозначна при re-run |
| crm-architect docs «тем 6» | 🟡 out-of-scope CC (post-merge) |
| Идемпотентность / повторный запуск CC | 🟡 уже смержено в ветку |

**Оценка: 9/10.** Промпт v1.1 — solid GO: inventory полный, learnings соблюдены, контраст-гейт корректен.  
**Рекомендация:** **не запускать CC повторно** — работа уже в `8ffee6d` на `feat/deal-card`. Промпт пригоден как reference / re-apply на чистом дереве (с оговоркой W1 про якорь вставки CSS). Post-merge: обновить `theme-system.md` / architecture «тем 7».

---

## Статус (live)

| Задача | Статус в репо |
|--------|----------------|
| 1 Inter + FOUC `t-minimal` | ✅ `layout.tsx` L2, L38–44, L60, L77 |
| 2 `THEMES` +7 | ✅ `theme-store.ts` L5 |
| 3 CSS `.t-minimal` + A11Y fills | ✅ `globals.css` L636–685 |
| 4 Settings swatch + `sm:grid-cols-4` | ✅ `SettingsContent.tsx` L29, L114 |
| 4b `THEME_SWATCHES['t-minimal']` | ✅ `ContentHeader.tsx` L42 |
| 5 `Theme = (typeof THEMES)[number]` | ✅ store L6; лишних union-списков нет |
| 6 `audit-contrast.py` + run | ✅ `theme_selectors` L116–120; **0 FAIL** по 7 темам |
| 7 build/tsc | ✅ `tsc --noEmit` clean (после коммита) |
| Коммит (точечный `git add`) | ✅ ровно 6 файлов спринта в `8ffee6d` |

Рабочее дерево по theme-файлам **чистое**; dirty — в основном `_analysis/*` / untracked (как в спринте).

---

## Live-разведка (сверка с РАЗВЕДКОЙ)

| Шаг | Live @ `8ffee6d` |
|-----|------------------|
| `THEMES` store | L5: 7 id, включая `t-minimal`; `Theme` из массива ✅ |
| FOUC `var V=` | `layout.tsx` L77: 7 id + `t-minimal` ✅ |
| Settings | L22–30 + Minimal; grid `sm:grid-cols-4` L114 ✅ |
| ContentHeader | `Record<Theme,string>` + `'t-minimal': '#C05A2E'` L35–43 ✅ |
| `.t-fuji` «хвост» | token/deco-стек заканчивается ~L631–634; **ещё** `.t-fuji` на L1259 (`.bg-yellow`) и L1623 (`.chat-own`) — см. W1 |
| Вставка Minimal | L636 — **после** fuji-kanban-блока, **перед** `SHARED GLOBALS` / `BASE STYLES` (~L687–729) ✅ по смыслу W1 |
| `scripts/audit-contrast.py` | есть; `t-minimal` в `theme_selectors` ✅ |
| Fonts layout | Inter `--font-inter`, weights 400–700, class на `<html>` ✅ |

Ветки «только aura / washi / fuji» (`AuraOrbs`, `isAura`, `isWashi`, `isFuji`, Charts, TaskCard) — opt-in; **minimal** корректно идёт в default light path (icon-sidebar, без орбов, без sumi/indigo).

---

## С чем согласен полностью

### 1. Паттерн light-темы как aura

Полный core-набор: surfaces, semantic + `*-text`, glass→opaque, elevations, **solid hex tracks** (learnings / theme-system), A11Y:

```css
.t-minimal .bg-accent { background-color: var(--accent-text) !important; }
/* … green/blue/red/purple/yellow … */
```

Белый на `#C05A2E` ≈ **4.43:1** (AA fail) → fill через `*-text` обязателен — в промпте и коде есть.

### 2. Шрифт только через `--font-app`

```css
--font-app: var(--font-inter, 'Inter');
```

Без прямого `font-family` на `.t-minimal` — совпадает с learnings («Never apply font changes globally»). `font-feature-settings: 'cv11'` на класс темы — ок (наследует с `html`).

### 3. Store / FOUC / ThemeProvider / cycleTheme

Расширение `THEMES` автоматически: `cycleTheme`, `ThemeProvider` (`THEMES.forEach` remove/add), merge unknown→`t-aura`. `LEGACY_THEMES` не трогать — верно.

### 4. Inventory пикеров (оба места)

Settings + ContentHeader + commit list — закрывает бывший B1 (tsc `Record<Theme>`).

### 5. Контраст-гейт

Имя скрипта и регистрация в `theme_selectors` — закрывает бывший B2. Live:

| Пара | Ratio | Требование |
|------|-------|------------|
| text / white | 17.35 | ≥4.5 ✅ |
| dim / white | 6.82 | ✅ |
| mute / white | 5.68 | ✅ |
| mute / surface3 | 4.73 | ✅ |
| border-input / surface | 3.42 | ≥3 ✅ |
| white / accent-text | 5.79 | ✅ |
| accent-text / bg | 5.36 | ✅ |

`audit-contrast.py`: **все 7 тем 0 FAIL** (регресс по старым 6 нет).

### 6. Сетка `sm:grid-cols-4`

При 7 темах 4+3 ровнее, чем 6+1 — ок.

### 7. Scope / commit hygiene

Нет SQL; точечный `git add` (6 файлов); docs skill — после merge (Cowork). Dirty `_analysis` не тащить — верно.

---

## Блокеры (критично — исправить до запуска)

**Нет.** v1.1 закрыл B1/B2; live-код и контраст подтверждают.

> Если цель — «запустить CC as-is на текущей ветке»: **не нужно** — уже реализовано. Блокеров для *качества промпта* нет.

---

## Предупреждения (желательно)

### W1. Якорь вставки CSS неоднозначен при re-run

Спринт: «после **всего** fuji-стека» + `grep '^\.t-fuji' | tail -3`.

Live `tail -3` сейчас включает правила **далеко после** theme-блоков:

- ~L631 — конец fuji-deco (хорошая точка)  
- L1259 — shared yellow fill  
- L1623 — `.chat-own` (S-CHAT)

Буквальное «после последнего `.t-fuji`» на чистом дереве без Minimal может воткнуть токен-блок **после** BASE STYLES / `@layer` / chat — хуже читаемости и риск путаницы с каскадом.  
**Фактическая вставка в `8ffee6d` (L636, перед SHARED GLOBALS) — правильная.**

**Правка промпта (на будущее):** якорь = «после последнего fuji-deco в theme-секции, **сразу перед** `/* SHARED GLOBALS` / `BASE STYLES`», не `tail` по всем `.t-fuji` в файле.

### W2. `.t-minimal .chat-own` не задан

Все 6 старых тем имеют токены своего пузыря (L1621–1626). Minimal наследует дефолт чата — обычно ок для light; визуально «свой» пузырь не подхватит терракоту. Не блокер M1; опциональный follow-up в S-CHAT / polish.

### W3. Мелкая неточность в предрасчёте mute

Спринт: «mute 5.27 (на белом)» → live **5.68:1**. Не влияет на гейт (оба ≥4.5).

### W4. crm-architect / docs всё ещё «тем 6»

`theme-system.md`, `architecture.md` (globals «6 тем», settings «6 тем»), learnings — не обновлены. Спринт корректно выносит это за CC; **после merge** обязательно, иначе дрейф памяти skill.

### W5. Повторный CC на этой ветке

Все 6 файлов уже изменены и закоммичены. Повторный прогон = no-op / риск шумного diff. Смоук (Inter computed, FOUC hard reload, оба пикера, cycle 7) — ручная проверка, не повтор задач 1–6.

### W6. `cycleTheme` в UI

По-прежнему только store (нет hotkey в UI). Смоук «cycleTheme 7» = console / unit; достаточно 7 свотчей в settings + header.

---

## Пропущенные места

| Файл / символ | Нужно для M1? |
|---------------|----------------|
| `ContentHeader` THEME_SWATCHES | ✅ уже в v1.1 / коде |
| `scripts/audit-contrast.py` | ✅ |
| `ThemeProvider` | нет (берёт `THEMES`) |
| `AuraOrbs` / `isAura` / Charts | нет (opt-in aura) |
| Washi/Fuji sidebar CSS | нет (селекторы scoped) |
| Dark `[data-modal]` | нет (surface opaque) |
| `.t-minimal .chat-own` | 🟡 опционально (W2) |
| tailwind `fontFamily.inter` | нет (`--font-app` на html) |

---

## Предлагаемые правки в спринт (если ещё правят документ)

1. **Статус-баннер:** «Реализовано в `8ffee6d` на `feat/deal-card` — CC не перезапускать; смоук/доки.»  
2. **W1:** заменить якорь вставки на `SHARED GLOBALS` / `BASE STYLES`, убрать опору на `tail` всех `.t-fuji`.  
3. (Опц.) Задача 3b: одна строка `.t-minimal .chat-own` с terracotta rgba — для паритета с 6 темами.  
4. Post-merge checklist: `theme-system.md` + architecture + learnings → «тем 7», Inter, swatch `#C05A2E`.

---

## Чеклист перед CC

- [x] B1 ContentHeader в промпте и коде  
- [x] B2 `audit-contrast.py` + регистрация `t-minimal`  
- [x] Нет SQL/миграций  
- [x] Tracks solid hex; glass none  
- [x] Нет `font-family` на `.t-minimal` — только `--font-app`  
- [x] Inter weights включают 700  
- [x] `npm`/tsc + contrast 0 FAIL  
- [ ] Ручной смоук: Inter computed, FOUC hard reload `/tasks`, settings+header, deals/tasks/project modal/⌘K, 6 старых тем  
- [ ] Post-merge: crm-architect «тем 7» (не CC)

---

## crm-architect checklist

- [x] РАЗВЕДКА  
- [x] Реальные пути (layout, store, globals, settings, ContentHeader, audit-contrast)  
- [x] CSS variables only; unlayered theme block  
- [x] learnings: `--font-app`, solid tracks, A11Y fills → `*-text`  
- [x] Полный inventory `Record<Theme>` / FOUC whitelist  
- [x] schema N/A; миграций нет  
- [x] SQL не apply из CC  
- [ ] Docs skill «тем 6» → 7 (post-merge, W4)
