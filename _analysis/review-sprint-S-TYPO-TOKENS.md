# Ревью: S-TYPO-TOKENS — text-meta / text-body (F-02, 13a)

**Дата:** 2026-07-21  
**Ревьюер:** Grok (верификация по коду `feat/tokens-geom` @ `c4c7ed0` ≡ tip `main`)  
**Объект:** `_analysis/sprint-S-TYPO-TOKENS.md` — семантические fontSize-токены `meta`/`body`, консолидация arbitrary `text-[11px]`×84 + `text-[13px]|0.8125rem`×27  
**Контекст:** post S-TOKENS-GEOM; client-only, миграций нет; вариант **13a** (0 визуального сдвига); спринт обновлён после ревью 2026-07-20 (впитал W1/W2, selective stage вместо `git add -A`); смежная ветка `feat/typo-scale` существует, `feat/typo-tokens` — нет

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА первой | ✅ |
| Counts 84 / 27 / 5 / 690 / 302 | ✅ 1:1 live |
| `mod:text-[11px]` пусто | ✅ |
| Грабля washi/fuji `.text-\[11px\]` L275/460 | ✅ реальна, 2b обязателен |
| `fontSize` отсутствует, `fontFamily` есть | ✅ |
| fontSize only size, без lineHeight | ✅ 0 vertical shift |
| Не трогать xs/sm/10px/inline font-size | ✅ scope-cut верен |
| Порядок: config → replace | ✅ |
| Пути / 7 тем / base `c4c7ed0` | ✅ |
| SQL / RLS / schema | ✅ N/A (client-only) |
| CSS: theme-scoped selectors | ✅ |
| Коммит: `git add $(rg -l OLD…)` **после** replace | ❌ B1 — стейдж tsx станет пустым |
| ProjectDetail «×9» vs 10 строк | 🟡 W1 doc slip |
| «~35 файлов» vs union **44** | 🟡 W2 |

**Оценка: 8.5/10.** Кодовая часть спринта точная и готова; сломан только рецепт стейджа в конце.  
**Рекомендация:** запускать в CC **после правки B1** в секции КОММИТ (или явный addendum в промпт). Без фикса B1 PR может уехать только с `tailwind.config.ts` + 2 строки globals — без 111 renames.

---

## Live-разведка (перегон команд спринта)

| Claim в спринте | Live |
|-----------------|------|
| `text-[11px]` | **84** (35 файлов) |
| `text-[13px]` + `text-[0.8125rem]` | **19 + 8 = 27** (14 файлов) |
| Union tsx к замене | **44** файла |
| `text-[10px]` | **5** — badge, leave |
| `text-xs` / `text-sm` | **690 / 302** — leave |
| `[a-z-]+:text-[11px]` | **пусто** |
| `placeholder:text-[0.8125rem]` | **1** — `ContactDetailHub.tsx:419` |
| globals `.text-\[11px\]` | **L275** `.t-washi`, **L460** `.t-fuji` |
| globals `font-size: 11px/13px/0.8125rem` | L569, 592, 1391 — CSS-значения, не TW-классы |
| `fontSize` в `tailwind.config.ts` | **нет**; `fontFamily` L12–15 |
| 7 тем | `t-aura t-washi t-fuji t-frost t-aurora t-tidal t-minimal` (`theme-store.ts`) |
| Base `c4c7ed0` | ✅ |
| Ветка `feat/typo-tokens` | ещё не создана (ок) |

### Якоря задачи 3 (выборочно, сверено)

| Файл | Live |
|------|------|
| `ui/Card.tsx:60`, `Table.tsx:14`, `Button.tsx:19`, `Input.tsx:12` | `text-[0.8125rem]` |
| `TaskCard.tsx:120` | `text-[0.8125rem] leading-[1.4]` — leading оставить |
| `TextNavSidebar.tsx:182` | `text-[13px]` (бренд); L154: `nav-vlabel text-[11px]` |
| `ProjectDetail.tsx` | **10**× `text-[13px]` (668, 706, 717, 729, 737, 753, 801, 836, 847, 1025) |
| `ContactDetailHub.tsx:81` | `text-[0.8125rem]` |
| `ContactDetailHub.tsx:419` | `placeholder:text-[0.8125rem]` (+ соседний `text-sm` — не трогать) |

### Body-only файлы (9) — важны для стейджа

`DealFocusPanel`, `DeliveryCompletionModal`, `PipelineBoard`, `StageReadiness`, `TaskCard`, `ui/Button`, `ui/Card`, `ui/Input`, `ui/Table` — в них нет `text-[11px]`; стейдж только по 11px-grep их пропустит.

### Грабля 2b (критичный путь)

```
275: .t-washi aside .text-\[11px\] { color: rgba(232,226,216,0.62) !important; }
460: .t-fuji  aside .text-\[11px\] { color: rgba(232,219,191,0.62) !important; }
```

Consumer: `TextNavSidebar.tsx:154` — `className="nav-vlabel text-[11px]"`. После 2a → `text-meta`; без 2b селектор мёртв → contrast regress (WCAG). **Синхронно в том же PR.**

---

## С чем согласен полностью

### 1. Вариант 13a — узаконить 13px отдельным токеном

Не сливать 13→`xs`(12)/`sm`(14): blast 1000+. Именованный `text-body` = 0 shift + SSOT для примитивов Card/Table/Button/Input.

### 2. Только fontSize, без lineHeight

```ts
fontSize: {
  meta: '0.6875rem', // 11px
  body: '0.8125rem', // 13px
},
```

Строковая форма TW **не** задаёт line-height → наследование как у arbitrary. Верно для «0 сдвига». Leading utilities (`leading-[1.4]`, `leading-relaxed`) остаются отдельными классами.

### 3. Scope-cut: не трогать mass `text-xs`/`text-sm`/`text-[10px]`

Подтверждено counts; расширять scope нельзя.

### 4. px→rem a11y-выигрыш только на meta

`text-meta` масштабируется с browser font-size; `text-[11px]` — нет. `text-body` value-identical к 13px/0.8125rem.

### 5. Задача 1 первой

Config до rename — иначе JIT/content не сгенерит утилиты.

### 6. `extend` deep-merge

`text-xs`/`sm`/… остаются; добавляются только `text-meta`/`text-body`.

### 7. Имена не kollidируют с color tokens

В конфиге цвета: `text-main` → утилита `text-text-main`. `fontSize.meta` → `text-meta`. Конфликта нет.

### 8. Нюансы placeholder + leading (бывшие Grok W1/W2)

Уже в спринте, сверены по коду — достаточно.

### 9. Client-only / RLS N/A / «не apply SQL»

Соответствует crm-architect; schema.md не трогаем.

### 10. Smoke: washi/fuji sidebar — главный gate

Правильный акцент; aura `nav-vlabel` size unchanged.

---

## Блокеры (критично — исправить до запуска / до коммита)

### B1. Рецепт стейджа tsx ломается **после** замен

Спринт (секция КОММИТ):

```bash
git add tailwind.config.ts src/app/globals.css
git add $(rg -l 'text-\[11px\]|text-\[13px\]|text-\[0\.8125rem\]' -g '*.tsx' src)
```

После задач 2–3 старых подстрок в tsx **0** → `rg -l` пуст → `git add` без аргументов-файлов → в commit могут попасть **только** config + globals (2 селектора), а 84+27 renames останутся unstaged / уйдут в «грязь» рядом с `_analysis/`.

Запрет `git add -A` — правильный (в дереве грязь `_analysis/`, `.grok/`). Нужен другой selective recipe, например:

```bash
git add tailwind.config.ts src/app/globals.css
git add -u -- src
# либо явный список:
# git add $(git diff --name-only -- 'src/**/*.tsx')
git status   # staged: config + globals + ~44 tsx; нет _analysis/ .grok/
```

Альтернатива: сохранить список файлов **до** replace:  
`rg -l '…' -g '*.tsx' src > /tmp/typo-files.txt` → после replace `git add $(cat /tmp/typo-files.txt)`.

**Без B1 CC может «успешно» закоммитить пустышку по tsx.**

---

## Предупреждения (желательно исправить)

### W1. ProjectDetail: «×9» при 10 строках

В списке 10 номеров (668…1025), live `rg` = **10**. Косметика; replace-all по файлу всё равно закроет все.

### W2. «~35 файлов» в КОММИТ

35 = файлы с `text-[11px]`; union с body-формами = **44**. Поправить формулировку, чтобы CC не ждал 35.

### W3. Inline `fontSize: 11|13` в style= (CalendarView, ActivityDrawer, charts…)

Вне scope — ок. Не путать с TW-классами при «найти все 11px». В verification-grep только class-паттерны — верно.

### W4. Имя `text-body` = 13px compact, не «body 16px»

Семантически спорно vs industry, но в спринте явно «body примитивов». Альтернатива `text-compact` не обязательна. Конфликта с HTML/`CardBody` нет.

### W5. Пост-счёт `text-meta|text-body` ~111

84+27=111 в tsx; +2 селектора в globals не попадут в `*.tsx` wc — ок. `placeholder:text-body` тоже matched.

### W6. `rm -rf .next` + tsc

Обязательны: смена fontSize-токенов и class names. Оставить.

### W7. База ветки

`feat/typo-tokens` от `main@c4c7ed0` (после GEOM). Не от `feat/typo-scale` и не от старого deal-card без GEOM. Сейчас worktree на `feat/tokens-geom` — перед стартом: checkout main → новая ветка.

### W8. crm-architect docs (nice-to-have, не блокер)

После мержа: одна строка в `theme-system.md` / learnings про `text-meta`/`text-body` — out of sprint ok.

---

## Пропущенные места

| Файл / зона | Находка | Действие |
|-------------|---------|----------|
| `src/**/*.tsx` arbitrary classes | Все 84+27 покрыты grep scope | Заменить |
| `src/app/globals.css` L275, L460 | Только 2 TW-селектора | 2b |
| `src/app/globals.css` L569, 592, 1391 | raw `font-size` | **Не трогать** |
| style=`fontSize: N` (calendar, drawer, charts) | не TW | **Не трогать** |
| `text-[10px]` ×5 (badge) | out of scope | **Не трогать** |
| Не-tsx под `src/` с class-паттернами | 0 | — |

Пробелов в inventory для заявленного scope **нет**.

---

## Предлагаемые правки в спринт

1. **B1** — заменить стейдж на `git add -u -- src` (+ явные config/globals) или pre-replace file list; убрать `rg -l` OLD-паттернов **после** replace.  
2. **W1** — `ProjectDetail` ×**10**, не ×9.  
3. **W2** — «~**44** tsx», не ~35.  
4. (Опционально) в РАЗВЕДКЕ добавить:  
   `grep -rhoE '[a-z-]+:text-\[(13px|0\.8125rem)\]' …` → ожидать 1× `placeholder:…` (уже описано в задаче 3).

Остальное можно в CC as-is.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА первой  
- [x] Имена таблиц/колонок — N/A  
- [x] Реальные пути (`tailwind.config.ts`, `src/app/globals.css`, components)  
- [x] learnings: theme-scoped CSS, CSS variables for colors (цвета не трогаем)  
- [x] Миграции SQL — нет; apply из CC — N/A  
- [x] org_id / RLS — N/A  
- [x] SECURITY DEFINER — N/A  
- [x] `flowType: 'implicit'` — N/A  
- [x] DELETE/CASCADE — N/A  
- [x] CSS: variables / theme class (2b остаётся `.t-washi`/`.t-fuji`)  
- [x] schema.md update — N/A  

---

## Чеклист перед CC

- [x] Counts 84 / 27 / 5 / 690 / 302 verified  
- [x] 2b selectors live (L275, L460)  
- [x] `nav-vlabel text-[11px]` consumer live  
- [x] placeholder + leading nuances in sprint  
- [ ] **B1** fix commit staging recipe  
- [ ] Branch: `main` → `feat/typo-tokens` (не от dirty analysis tree blindly)  
- [ ] Task 1: `fontSize.meta/body` in `theme.extend` next to `fontFamily`  
- [ ] 2a: all `text-[11px]` → `text-meta`  
- [ ] 2b: globals → `.text-meta` **sync**  
- [ ] 3: all `text-[13px]` / `text-[0.8125rem]` → `text-body` (incl. placeholder)  
- [ ] leave: 10px, xs, sm, globals font-size L569/592/1391, inline styles  
- [ ] `npx tsc --noEmit` = 0; greps clean; `rm -rf .next`  
- [ ] smoke ×7 тем, **washi/fuji sidebar contrast** primary  
- [ ] staged only config + globals + ~44 tsx; no `_analysis/` / `.grok/`  
- [ ] push `feat/typo-tokens`; merge через гейт (не из CC)

---

## Итог

| | |
|--|--|
| **Вердикт** | **8.5/10 — GO after B1** |
| **Blockers** | B1 commit staging (`rg -l` OLD после replace) |
| **Critical path** | 2b globals sync with 2a (washi/fuji contrast) |
| **Code accuracy** | Counts, paths, gotchas, scope — solid |
| **Файлы** | `tailwind.config.ts`, `globals.css` (2 lines), **44** tsx |
| **В CC?** | Да, с исправленным КОММИТ-блоком (или устным addendum B1) |
