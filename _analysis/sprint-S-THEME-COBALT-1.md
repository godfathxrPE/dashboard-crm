# Спринт S-THEME-COBALT-1 — дефолтная тема: лайм → кобальт

**Вход:** `main` ПОСЛЕ мержа S-STAGE-PROFILE-1 (карта воронки + fix палитры). **Ветка:** `feat/theme-cobalt-1`.
**Миграций НЕТ. Запросов НЕТ. Зависимостей НЕТ.**

Решение владельца 24.09: лаймовый акцент не подходит CRM, берём **Cobalt**. Превью трёх вариантов
на фрагменте карточки сделки с контрастом — артефакт «Замена лайма» от 24.09.

---

## Зачем и что именно меняется

Каркас темы (решения 05.09, `claude/decisions-lime-theme-2026-09-05.md`) **остаётся**: почти белый
фон `#FAF8F5`, чернила `#17171C`, тёмный материал «Следующего шага», один акцент с бюджетом пять
пятен на экран, зоны по формуле, рельс без разделителей. **Меняется только акцент** и то, что от
него выводится.

Лайм был цветом, который нельзя печатать: заливка к белому 1.29:1, текст на нём тёмный. Отсюда
костыли в `globals.css` с `!important` (82 места `bg-accent text-white`, 321 `.text-accent`).
Кобальт держит белый текст и сам читается как текст — **костыли снимаются, а не переписываются**.

**Ключ темы переименовывается `t-lime` → `t-cobalt`.** Миграция сохранённого выбора бесплатна:
`resolvePersistedTheme` и FOUC-гард в `layout.tsx` уже отправляют неизвестное значение в дефолт,
а дефолтом станет `t-cobalt` (тот же путь, что проверен кейсом `t-scandi` в тестах).

### Токены (посчитано `color-architect/scripts/contrast.py`)

| Токен | Было (lime) | Стало (cobalt) | Замер |
|---|---|---|---|
| `--accent` | `#C9F25A` | `#275DE5` (OKLCH .53 .215 264) | белый на нём 5.55:1 · к `--bg` 5.24:1 |
| `--accent-text` | `#336809` | `#1D4BC0` (OKLCH .46 .19 264) | к `--bg` 7.03:1 · к белому 7.45:1 |
| `--on-accent` | `#14210A` | `#FFFFFF` | 5.55:1 |
| `--accent-l` / `-l2` | `rgba(201,242,90,.18/.32)` | `rgba(39,93,229,.10)` / `rgba(39,93,229,.22)` | подложки |
| `--blue` / `-text` / `-l` | `#2563C9` / `#1A5EA8` | **`#007E9C` / `#006882` / `rgba(0,126,156,.10)`** (циан, H≈218) | белый на `#007E9C` 4.70 · `#006882` к `--bg` 6.00 |
| `--shadow-accent` | `rgba(185,240,74,.40)` | `0 6px 16px rgba(39,93,229,.28)` | — |
| `--glass-sheen` (последний стоп) | `rgba(201,242,90,.08)` | `rgba(39,93,229,.12)` | блик материала |
| `--sheet-glass` | `rgba(3,8,0,.84)` | `rgba(3,8,28,.84)` | — |
| `--sheet-mark` / `-fill` | `#C9F25A` | `#93B7FF` (OKLCH .78 .12 264) | к ink 8.89:1 |
| `--sheet-mark-ink` | `#030800` | `#050B1F` | — |
| `--zone-work` | формула `:root`, 14% | **8%** override в `.t-cobalt` | кобальт тёмный: 14% давали тяжёлую `#D9DEEF` |

**Почему «инфо»-синий уходит в циан.** Иначе «можно нажать» (акцент) и «звонок/инфо»
(`--blue`, 41 использование: `CallLog`, `Badge`, графики, стадии) — один цвет, и акцент перестаёт
кодировать. Это тот же принцип Р2, по которому 05.09 развели лайм и зелёный «в норме».
Семантика `--green/--red/--yellow/--purple` **не трогается**.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
grep -rn "t-lime" src scripts tests --include=*.ts --include=*.tsx --include=*.py | grep -v globals.css
grep -n "t-lime" src/app/globals.css | wc -l          # ожидание ≈ 20
grep -n "C9F25A\|201,242,90\|201, 242, 90\|185,240,74" src/app/globals.css
python3 scripts/audit-contrast.py 2>&1 | grep -E "^=== "   # базовый счёт: 3 FAIL (nav-active frost/aurora/tidal)
```

Ожидаемые места вне `globals.css`: `src/lib/stores/theme-store.ts` (THEMES, DEFAULT_THEME),
`src/app/layout.tsx` (класс `<html>` и whitelist FOUC-гарда), `src/components/settings/SettingsContent.tsx`
(подпись), `src/lib/constants/themes.ts` (свотч), `tests/unit/theme-store.test.ts`,
`scripts/audit-contrast.py`. Нашлось что-то ещё — отчитаться списком, не молча переименовывать.

## ЗАДАЧА 1 — блок темы в `globals.css`

1. Селектор `.t-lime {` → `.t-cobalt {`. Внутри заменить токены по таблице. Комментарий над
   блоком (про лайм 76°, 1.29:1 и т.п.) переписать на кобальт: факты замеров из таблицы, одна
   строка «до 24.09 тема была лаймовой, см. decisions-lime-theme-2026-09-05».
2. Добавить в блок `.t-cobalt` строку
   `--zone-work: color-mix(in srgb, var(--zone-work-tint) 8%, var(--zone-base));` с комментарием
   «кобальт тёмный — 14% из `:root` дают тяжёлую зону». Проверить, что `.t-cobalt` стоит в файле
   ПОСЛЕ `:root`, где объявлен `--zone-work` (≈ строка 44) — иначе override проиграет.
3. `.t-lime { --tw-ring-color: var(--accent-text); }` → `.t-cobalt { … }` (оставить).
4. `.t-lime    { --sheet-glass: … }` (блок материала, ≈ строка 2659) → `.t-cobalt` с новыми
   `--sheet-*` из таблицы.

## ЗАДАЧА 2 — снять костыли лайма

Удалить правила, которые существовали только потому, что лайм нельзя печатать:

- `.t-lime button.bg-accent, .t-lime a.bg-accent, .t-lime .bg-accent.text-white { color: var(--on-accent) !important; }`
  — белый на кобальте 5.55:1, `text-white` верен сам.
- `.t-lime .text-accent { color: var(--accent-text) !important; }` — кобальт как текст к `--bg` 5.24:1.
- `.t-lime .entity-tile { background: var(--glass-bg); color: var(--accent); }` — тема возвращается
  к базовому примитиву (`--accent-l` + `--accent-text`, 7.45:1), как семь остальных.

Переименовать в `.t-cobalt` (НЕ удалять) — это не про цвет лайма, а про раскладку/семантику:
- `aside[data-app-nav] .nav-active` и `.nav-active .lucide` (заливка-индикатор + `--sidebar-active-text`);
- рельс без разделителей (`aside[data-app-nav]` transparent + три `border-color: transparent`);
- `.bg-green { background-color: var(--green-text) !important; }` (белый на `#1B8A4C` 4.39);
- `.t-lime .bg-yellow` в общем селекторе с fuji/washi.

Проверка: `grep -n "t-lime" src/app/globals.css` — ноль совпадений вне комментариев-истории.

## ЗАДАЧА 3 — ключ темы в коде

- `theme-store.ts`: `THEMES` — `'t-cobalt'` первой вместо `'t-lime'`; `DEFAULT_THEME = 't-cobalt'`.
- `layout.tsx`: класс `<html>` `t-cobalt`; в строке FOUC-гарда `var V=[…]` — `'t-cobalt'` вместо `'t-lime'`.
  Комментарии там же — про дефолт `t-cobalt`.
- `SettingsContent.tsx`: `{ id: 't-cobalt', label: 'Cobalt' }`.
- `themes.ts`: `'t-cobalt': '#275DE5'`, комментарий «свотч равен `--accent`» оставить по смыслу.
- `Record<Theme, string>` не даст забыть свотч — `tsc` это поймает.

## ЗАДАЧА 4 — `scripts/audit-contrast.py`

- Ключ `'t-lime': '.t-lime'` → `'t-cobalt': '.t-cobalt'`; в `YELLOW_DARKEN_FILL` и словаре рельса
  (`'t-lime': 'bg'`) — то же переименование.
- Ветку `elif th == 't-lime':` (заливка лайма + `--on-accent`) удалить: кобальт идёт общим путём
  «белый текст на заливке». `green` у кобальта затемнён правилом `.bg-green` — сохранить эту часть
  (перенести в общую ветку, если после удаления `elif` она теряется; проверить результат прогона).
- `accent_ui = … if th == 't-lime' else accent` → общий `accent`: кобальтом обводят и пишут.

Проверка: прогон даёт `t-cobalt: 0 FAIL`, всего по-прежнему ровно 3 FAIL (nav-active тёмных тем).

## ЗАДАЧА 5 — комментарии, которые станут ложью

`grep -rn -i "лайм\|lime" src --include=*.tsx --include=*.ts` — там, где комментарий описывает
ТЕКУЩЕЕ поведение (`DealDeadlineTrack.tsx:22,55,352`, `DealNextStep.tsx:176`, `DealHeader.tsx:386`,
`DealStakeholders.tsx:296`), переписать на акцент темы/кобальт. Исторические ссылки
(«решение 05.09», «S-LIME-TOKENS-1») не трогать.

## ТЕСТЫ

`tests/unit/theme-store.test.ts`: заменить ожидания `t-lime` → `t-cobalt` (дефолт, первая в списке,
восемь тем) и **добавить кейс** `['сохранённый t-lime → новый дефолт', 't-lime', 't-cobalt']` —
это и есть миграция выбора существующих пользователей. Остальная правка — стили, тестов не требует.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -3
python3 scripts/audit-contrast.py 2>&1 | grep -E "^=== " | grep -v " 0 FAIL"   # ровно 3 строки
python3 scripts/audit-tokens.py 2>&1 | tail -2
grep -rn "t-lime" src scripts tests | grep -v "^src/app/globals.css.*/\*" | head
npm run build 2>&1 | tail -5
```

Приёмка глазами (ТОЛЬКО просмотр) в `t-cobalt`: карточка сделки (CTA кокпита, активный пункт
нава, метка и «Шаг сделан» на тёмном материале, колонка «сегодня» таймлайна, текущая стадия на
карте воронки), список сделок, «Задачи», «Звонки» (циан вместо синего), настройки — выбор темы.
FOUC: в localStorage `dashboard-theme` = `{"state":{"theme":"t-lime"},"version":0}` → страница
открывается сразу в кобальте, без вспышки. Бюджет акцента — не больше пяти кобальтовых пятен на
экране карточки сделки (Р2).

## КОММИТ

```
feat(theme): дефолтная тема — кобальт вместо лайма (t-lime → t-cobalt)

- акцент #275DE5 держит белый текст (5.55:1) и сам читается как текст (5.24:1):
  сняты костыли лайма — on-accent на 82 кнопках, .text-accent → accent-text, тёмная entity-tile
- «инфо»-синий уведён в циан #007E9C: иначе акцент и звонки — один цвет (принцип Р2)
- зона «Работа» 8% акцента вместо 14%; материал шага — кобальтовая метка #93B7FF
- ключ темы переименован; сохранённый t-lime уходит в дефолт штатным путём (тест)
- audit-contrast: t-cobalt 0 FAIL
```

**Не мержить.** Отчёт — на гейт. В отчёт — вывод `audit-contrast` по `t-cobalt` целиком.
